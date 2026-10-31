import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { grievancePriorities, grievanceStatuses } from '@sgrs/contracts';
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
import {
  MAX_EVIDENCE_BYTES,
  MAX_EVIDENCE_FILES_PER_REQUEST,
} from '../application/evidence-service.js';
import type { EvidenceService } from '../application/evidence-service.js';
import type { GrievanceService } from '../application/grievance-service.js';
import type { IncomingEvidence } from '../application/evidence-service.js';
import type { GrievancePatch } from '../domain/validation.js';

const uuidSchema = z.string().uuid();
const listSchema = z.object({
  status: z.enum(grievanceStatuses).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(150).optional(),
  sort: z.enum(['updated', 'deadline', 'status']).default('updated'),
});
const patchSchema = z
  .object({
    version: z.number().int().min(1),
    title: z.string().max(150).nullable().optional(),
    description: z.string().max(20_000).nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    incidentDate: z.string().nullable().optional(),
    location: z.string().max(240).nullable().optional(),
    priority: z.enum(grievancePriorities).optional(),
  })
  .strict();

function parseUuid(value: string): string {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success)
    throw new AppError(400, 'VALIDATION_FAILED', 'A valid grievance identifier is required.');
  return parsed.data;
}

function multipartLimitError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'FST_FILES_LIMIT' || error.code === 'FST_PARTS_LIMIT')
  );
}

async function readIncomingEvidence(request: FastifyRequest): Promise<IncomingEvidence[]> {
  if (!request.isMultipart()) {
    throw new AppError(415, 'MULTIPART_REQUIRED', 'Upload evidence using a multipart form.');
  }
  const files: IncomingEvidence[] = [];
  try {
    for await (const part of request.files({
      throwFileSizeLimit: false,
      limits: {
        fileSize: MAX_EVIDENCE_BYTES + 1,
        files: MAX_EVIDENCE_FILES_PER_REQUEST,
        fields: 0,
        parts: MAX_EVIDENCE_FILES_PER_REQUEST,
      },
    })) {
      const bytes = await part.toBuffer();
      files.push({
        fileName: part.filename,
        claimedMimeType: part.mimetype,
        bytes,
        truncated: part.file.truncated,
      });
    }
  } catch (error) {
    if (multipartLimitError(error)) {
      throw new AppError(
        413,
        'FILE_COUNT_LIMIT',
        `Upload at most ${MAX_EVIDENCE_FILES_PER_REQUEST} files at a time.`,
      );
    }
    throw error;
  }
  if (files.length === 0)
    throw new AppError(400, 'FILE_REQUIRED', 'Choose at least one evidence file.');
  return files;
}

export async function registerGrievanceRoutes(
  app: FastifyInstance,
  authService: AuthService,
  grievanceService: GrievanceService,
  evidenceService: EvidenceService,
  environment: Environment,
): Promise<void> {
  const authenticate = requireAuthentication(authService, environment);
  const sameOrigin = requireSameOrigin(environment);
  const csrf = requireCsrf(authService, environment);
  const readers = requireRoles('STUDENT', 'HANDLER', 'REVIEWER', 'ADMINISTRATOR');
  const students = requireRoles('STUDENT');

  app.get(
    '/api/v1/student/grievance-categories',
    { preHandler: [authenticate, students] },
    async () => ({ data: { items: await grievanceService.categories() } }),
  );

  app.post(
    '/api/v1/student/grievances',
    { preHandler: [authenticate, students, sameOrigin, csrf] },
    async (request, reply) => {
      const grievance = await grievanceService.createDraft(authenticatedActor(request), request.id);
      return reply.status(201).send({ data: grievance });
    },
  );

  app.get('/api/v1/grievances', { preHandler: [authenticate, readers] }, async (request) => {
    const query = listSchema.safeParse(request.query);
    if (!query.success) {
      throw new AppError(
        400,
        'VALIDATION_FAILED',
        'Check the grievance list filters and try again.',
      );
    }
    return {
      data: await grievanceService.list(authenticatedActor(request), {
        page: query.data.page,
        pageSize: query.data.pageSize,
        ...(query.data.status ? { status: query.data.status } : {}),
        ...(query.data.q ? { query: query.data.q } : {}),
        sort: query.data.sort,
      }),
    };
  });

  app.get<{ Params: { grievanceId: string } }>(
    '/api/v1/grievances/:grievanceId',
    { preHandler: [authenticate, readers] },
    async (request) => ({
      data: await grievanceService.get(
        authenticatedActor(request),
        parseUuid(request.params.grievanceId),
      ),
    }),
  );

  app.patch<{ Params: { grievanceId: string } }>(
    '/api/v1/student/grievances/:grievanceId',
    { preHandler: [authenticate, students, sameOrigin, csrf] },
    async (request) => {
      const grievanceId = parseUuid(request.params.grievanceId);
      const parsed = patchSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_FAILED', 'Check the grievance fields and try again.', {
          fields: parsed.error.issues.map((issue) => ({
            field: String(issue.path[0] ?? 'form'),
            message: issue.message,
          })),
        });
      }
      const version = parsed.data.version;
      const patch = Object.fromEntries(
        Object.entries(parsed.data).filter(
          ([key, value]) => key !== 'version' && value !== undefined,
        ),
      ) as GrievancePatch;
      return {
        data: await grievanceService.updateDraft(authenticatedActor(request), {
          grievanceId,
          expectedVersion: version,
          patch,
          requestId: request.id,
        }),
      };
    },
  );

  app.post<{ Params: { grievanceId: string } }>(
    '/api/v1/student/grievances/:grievanceId/submit',
    { preHandler: [authenticate, students, sameOrigin, csrf] },
    async (request) => {
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string') {
        throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A submission key is required.');
      }
      return {
        data: await grievanceService.submit(authenticatedActor(request), {
          grievanceId: parseUuid(request.params.grievanceId),
          submissionKey: key,
          requestId: request.id,
        }),
      };
    },
  );

  app.post<{ Params: { grievanceId: string } }>(
    '/api/v1/student/grievances/:grievanceId/withdraw',
    { preHandler: [authenticate, students, sameOrigin, csrf] },
    async (request) => ({
      data: await grievanceService.withdraw(
        authenticatedActor(request),
        parseUuid(request.params.grievanceId),
        request.id,
      ),
    }),
  );

  app.post<{ Params: { grievanceId: string } }>(
    '/api/v1/student/grievances/:grievanceId/evidence',
    { preHandler: [authenticate, students, sameOrigin, csrf] },
    async (request, reply) => {
      const actor = authenticatedActor(request);
      const grievanceId = parseUuid(request.params.grievanceId);
      await grievanceService.get(actor, grievanceId);
      const files = await readIncomingEvidence(request);
      const result = await evidenceService.upload(actor, grievanceId, files, request.id);
      return reply.status(result.items.length ? 201 : 200).send({ data: result });
    },
  );

  app.get<{ Params: { grievanceId: string; evidenceId: string } }>(
    '/api/v1/grievances/:grievanceId/evidence/:evidenceId',
    { preHandler: [authenticate, readers] },
    async (request, reply) => {
      const result = await evidenceService.open(
        authenticatedActor(request),
        parseUuid(request.params.grievanceId),
        parseUuid(request.params.evidenceId),
        request.id,
      );
      const safeName = result.originalName.replace(/[\r\n"\\]/g, '_');
      reply
        .header('content-type', result.mediaType)
        .header(
          'content-disposition',
          `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        )
        .header('cache-control', 'private, no-store')
        .header('x-content-type-options', 'nosniff');
      return reply.send(result.stream);
    },
  );
}
