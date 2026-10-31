import { userRoles } from '@sgrs/contracts';
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
import type { UserService } from '../application/user-service.js';

const roleSchema = z.enum(userRoles);
const createUserSchema = z
  .object({
    email: z.string().trim().email().max(320),
    name: z.string().trim().min(1).max(160),
    initialPassword: z.string().min(1).max(1_024),
    role: roleSchema,
    departmentId: z.string().uuid().nullable().optional(),
    contact: z.string().max(80).nullable().optional(),
  })
  .strict();

const updateUserSchema = z
  .object({
    email: z.string().trim().email().max(320).optional(),
    name: z.string().trim().min(1).max(160).optional(),
    role: roleSchema.optional(),
    departmentId: z.string().uuid().nullable().optional(),
    contact: z.string().max(80).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

const listUsersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: roleSchema.optional(),
  active: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

function invalidBody(): never {
  throw new AppError(400, 'VALIDATION_FAILED', 'Check the request fields and try again.');
}

export async function registerUserRoutes(
  app: FastifyInstance,
  authService: AuthService,
  userService: UserService,
  environment: Environment,
): Promise<void> {
  const authenticate = requireAuthentication(authService, environment);
  const isAdmin = requireRoles('ADMINISTRATOR');
  const sameOrigin = requireSameOrigin(environment);
  const csrf = requireCsrf(authService, environment);

  app.get('/api/v1/admin/users', { preHandler: [authenticate, isAdmin] }, async (request) => {
    const filters = listUsersSchema.safeParse(request.query);
    if (!filters.success) invalidBody();
    const { q, role, active, page, pageSize } = filters.data;
    const result = await userService.list({
      ...(q ? { query: q } : {}),
      ...(role ? { role } : {}),
      ...(active === undefined ? {} : { isActive: active }),
      page,
      pageSize,
    });
    return { data: result };
  });

  app.post(
    '/api/v1/admin/users',
    { preHandler: [authenticate, isAdmin, sameOrigin, csrf] },
    async (request, reply) => {
      const parsed = createUserSchema.safeParse(request.body);
      if (!parsed.success) invalidBody();
      const user = await userService.create({
        actorId: authenticatedActor(request).userId,
        email: parsed.data.email,
        name: parsed.data.name,
        password: parsed.data.initialPassword,
        role: parsed.data.role,
        ...(parsed.data.departmentId === undefined
          ? {}
          : { departmentId: parsed.data.departmentId }),
        ...(parsed.data.contact === undefined ? {} : { contact: parsed.data.contact }),
        requestId: request.id,
      });
      return reply.status(201).send({ data: user });
    },
  );

  app.patch<{ Params: { userId: string } }>(
    '/api/v1/admin/users/:userId',
    { preHandler: [authenticate, isAdmin, sameOrigin, csrf] },
    async (request) => {
      const userId = z.string().uuid().safeParse(request.params.userId);
      const changes = updateUserSchema.safeParse(request.body);
      if (!userId.success || !changes.success) invalidBody();
      const user = await userService.update({
        actorId: authenticatedActor(request).userId,
        targetUserId: userId.data,
        changes: Object.fromEntries(
          Object.entries(changes.data).filter(([, value]) => value !== undefined),
        ),
        requestId: request.id,
      });
      return { data: user };
    },
  );
}
