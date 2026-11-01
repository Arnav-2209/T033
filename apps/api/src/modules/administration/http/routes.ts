import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Environment } from '../../../config/env.js';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import type { AuthService } from '../../auth/application/auth-service.js';
import {
  authenticatedActor,
  requireAuthentication,
  requireCsrf,
  requireRoles,
  requireSameOrigin,
} from '../../auth/http/security.js';
import type { AdministrationService } from '../application/administration-service.js';

const uuid = z.string().uuid();
const createCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().max(4_000).nullable().optional(),
    slaHours: z.number().int().min(1).max(8_760),
  })
  .strict();
const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().max(4_000).nullable().optional(),
    isActive: z.boolean().optional(),
    slaHours: z.number().int().min(1).max(8_760).optional(),
  })
  .strict();
const mappingSchema = z.object({ handlerId: uuid, isPrimary: z.boolean().default(false) }).strict();
const ruleSchema = z
  .object({
    level: z.number().int().min(1).max(20),
    reviewerId: uuid.nullable(),
    timelineHours: z.number().int().min(1).max(8_760).nullable(),
    isActive: z.boolean().default(true),
  })
  .strict();
const directoryQuery = z.object({ q: z.string().trim().max(120).optional() });

function body<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Check the configuration fields and try again.');
  }
  return parsed.data;
}

function parseUuid(value: string): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success)
    throw new AppError(400, 'VALIDATION_FAILED', 'A valid identifier is required.');
  return parsed.data;
}

function adminActor(request: Parameters<typeof authenticatedActor>[0]) {
  const actor = authenticatedActor(request);
  return { actorId: actor.userId, role: actor.role };
}

export async function registerAdministrationRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: AdministrationService,
  environment: Environment,
): Promise<void> {
  const authenticate = requireAuthentication(auth, environment);
  const admin = requireRoles('ADMINISTRATOR');
  const sameOrigin = requireSameOrigin(environment);
  const csrf = requireCsrf(auth, environment);

  app.get('/api/v1/admin/categories', { preHandler: [authenticate, admin] }, async (request) => ({
    data: { items: await service.listCategories(authenticatedActor(request)) },
  }));

  app.post(
    '/api/v1/admin/categories',
    { preHandler: [authenticate, admin, sameOrigin, csrf] },
    async (request, reply) => {
      const input = body(createCategorySchema, request.body);
      return reply.status(201).send({
        data: await service.createCategory({
          ...adminActor(request),
          ...input,
          description: input.description ?? null,
          requestId: request.id,
        }),
      });
    },
  );

  app.patch<{ Params: { categoryId: string } }>(
    '/api/v1/admin/categories/:categoryId',
    { preHandler: [authenticate, admin, sameOrigin, csrf] },
    async (request) => ({
      data: await service.updateCategory({
        ...adminActor(request),
        categoryId: parseUuid(request.params.categoryId),
        changes: Object.fromEntries(
          Object.entries(body(updateCategorySchema, request.body)).filter(
            ([, value]) => value !== undefined,
          ),
        ) as { name?: string; description?: string | null; isActive?: boolean; slaHours?: number },
        requestId: request.id,
      }),
    }),
  );

  app.post<{ Params: { categoryId: string } }>(
    '/api/v1/admin/categories/:categoryId/handlers',
    { preHandler: [authenticate, admin, sameOrigin, csrf] },
    async (request, reply) => {
      const input = body(mappingSchema, request.body);
      return reply.status(201).send({
        data: await service.addHandlerMapping({
          ...adminActor(request),
          categoryId: parseUuid(request.params.categoryId),
          ...input,
          requestId: request.id,
        }),
      });
    },
  );

  app.delete<{ Params: { categoryId: string; mappingId: string } }>(
    '/api/v1/admin/categories/:categoryId/handlers/:mappingId',
    { preHandler: [authenticate, admin, sameOrigin, csrf] },
    async (request) => ({
      data: await service.endHandlerMapping({
        ...adminActor(request),
        categoryId: parseUuid(request.params.categoryId),
        mappingId: parseUuid(request.params.mappingId),
        requestId: request.id,
      }),
    }),
  );

  app.patch<{ Params: { categoryId: string; mappingId: string } }>(
    '/api/v1/admin/categories/:categoryId/handlers/:mappingId/primary',
    { preHandler: [authenticate, admin, sameOrigin, csrf] },
    async (request) => ({
      data: await service.setPrimaryHandler({
        ...adminActor(request),
        categoryId: parseUuid(request.params.categoryId),
        mappingId: parseUuid(request.params.mappingId),
        requestId: request.id,
      }),
    }),
  );

  app.put<{ Params: { categoryId: string } }>(
    '/api/v1/admin/categories/:categoryId/escalation-rules',
    { preHandler: [authenticate, admin, sameOrigin, csrf] },
    async (request) => ({
      data: await service.saveEscalationRule({
        ...adminActor(request),
        categoryId: parseUuid(request.params.categoryId),
        ...body(ruleSchema, request.body),
        requestId: request.id,
      }),
    }),
  );

  app.get('/api/v1/admin/directory', { preHandler: [authenticate, admin] }, async (request) => {
    const parsed = directoryQuery.safeParse(request.query);
    if (!parsed.success)
      throw new AppError(400, 'VALIDATION_FAILED', 'Check the directory search.');
    return {
      data: {
        items: await service.listDirectory({
          ...adminActor(request),
          ...(parsed.data.q === undefined ? {} : { query: parsed.data.q }),
        }),
      },
    };
  });
}
