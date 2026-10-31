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
import type { CaseWorkflowService } from '../application/case-workflow-service.js';

const uuid = z.string().uuid();
const messageSchema = z.object({ body: z.string().max(20_000) }).strict();
const reasonSchema = z.object({ reason: z.string().max(4_000) }).strict();
const reviewerAssignmentSchema = z.object({ reviewerId: uuid }).strict();
const queueQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(150).optional(),
});

function parseUuid(value: string): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success)
    throw new AppError(400, 'VALIDATION_FAILED', 'A valid identifier is required.');
  return parsed.data;
}

function body<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new AppError(400, 'VALIDATION_FAILED', 'Check the request fields and try again.');
  return parsed.data;
}

export async function registerWorkflowRoutes(
  app: FastifyInstance,
  authService: AuthService,
  workflows: CaseWorkflowService,
  environment: Environment,
): Promise<void> {
  const authenticate = requireAuthentication(authService, environment);
  const sameOrigin = requireSameOrigin(environment);
  const csrf = requireCsrf(authService, environment);
  const handler = requireRoles('HANDLER');
  const reviewer = requireRoles('REVIEWER');
  const student = requireRoles('STUDENT');
  const admin = requireRoles('ADMINISTRATOR');

  app.get('/api/v1/handler/workload', { preHandler: [authenticate, handler] }, async (request) => ({
    data: await workflows.handlerWorkload(authenticatedActor(request)),
  }));

  app.post<{ Params: { grievanceId: string } }>(
    '/api/v1/handler/grievances/:grievanceId/start-review',
    { preHandler: [authenticate, handler, sameOrigin, csrf] },
    async (request) => ({
      data: await workflows.startHandlerReview(
        authenticatedActor(request),
        parseUuid(request.params.grievanceId),
        request.id,
      ),
    }),
  );
  app.post<{ Params: { grievanceId: string } }>(
    '/api/v1/handler/grievances/:grievanceId/internal-notes',
    { preHandler: [authenticate, handler, sameOrigin, csrf] },
    async (request) => ({
      data: await workflows.addHandlerInternalNote(
        authenticatedActor(request),
        parseUuid(request.params.grievanceId),
        body(messageSchema, request.body).body,
        request.id,
      ),
    }),
  );
  app.post<{ Params: { grievanceId: string } }>(
    '/api/v1/handler/grievances/:grievanceId/information-requests',
    { preHandler: [authenticate, handler, sameOrigin, csrf] },
    async (request) => ({
      data: await workflows.requestInformation(
        authenticatedActor(request),
        parseUuid(request.params.grievanceId),
        body(messageSchema, request.body).body,
        request.id,
      ),
    }),
  );
  app.post<{ Params: { grievanceId: string; requestId: string } }>(
    '/api/v1/student/grievances/:grievanceId/information-requests/:requestId/responses',
    { preHandler: [authenticate, student, sameOrigin, csrf] },
    async (request) => ({
      data: await workflows.respondToInformation(
        authenticatedActor(request),
        parseUuid(request.params.grievanceId),
        parseUuid(request.params.requestId),
        body(messageSchema, request.body).body,
        request.id,
      ),
    }),
  );
  app.post<{ Params: { grievanceId: string } }>(
    '/api/v1/handler/grievances/:grievanceId/escalations',
    { preHandler: [authenticate, handler, sameOrigin, csrf] },
    async (request, reply) =>
      reply.status(201).send({
        data: await workflows.escalate(
          authenticatedActor(request),
          parseUuid(request.params.grievanceId),
          body(reasonSchema, request.body).reason,
          request.id,
        ),
      }),
  );

  app.get(
    '/api/v1/reviewer/escalations',
    { preHandler: [authenticate, reviewer] },
    async (request) => {
      const parsed = queueQuery.safeParse(request.query);
      if (!parsed.success)
        throw new AppError(400, 'VALIDATION_FAILED', 'Check the escalation queue filters.');
      return {
        data: await workflows.reviewerQueue(authenticatedActor(request), {
          page: parsed.data.page,
          pageSize: parsed.data.pageSize,
          ...(parsed.data.q ? { query: parsed.data.q } : {}),
        }),
      };
    },
  );
  app.post<{ Params: { grievanceId: string; level: string } }>(
    '/api/v1/reviewer/grievances/:grievanceId/escalations/:level/start',
    { preHandler: [authenticate, reviewer, sameOrigin, csrf] },
    async (request) => ({
      data: await workflows.startReviewerHandling(
        authenticatedActor(request),
        parseUuid(request.params.grievanceId),
        Number(request.params.level),
        request.id,
      ),
    }),
  );
  app.post<{ Params: { grievanceId: string } }>(
    '/api/v1/reviewer/grievances/:grievanceId/directions',
    { preHandler: [authenticate, reviewer, sameOrigin, csrf] },
    async (request) => ({
      data: await workflows.addReviewerDirection(
        authenticatedActor(request),
        parseUuid(request.params.grievanceId),
        body(messageSchema, request.body).body,
        request.id,
      ),
    }),
  );
  app.post<{ Params: { grievanceId: string } }>(
    '/api/v1/reviewer/grievances/:grievanceId/escalations',
    { preHandler: [authenticate, reviewer, sameOrigin, csrf] },
    async (request, reply) =>
      reply.status(201).send({
        data: await workflows.escalate(
          authenticatedActor(request),
          parseUuid(request.params.grievanceId),
          body(reasonSchema, request.body).reason,
          request.id,
        ),
      }),
  );

  app.get('/api/v1/admin/reviewers', { preHandler: [authenticate, admin] }, async (request) => ({
    data: { items: await workflows.activeReviewers(authenticatedActor(request)) },
  }));
  app.get(
    '/api/v1/admin/escalations/manual-assignment',
    { preHandler: [authenticate, admin] },
    async (request) => ({
      data: { items: await workflows.manualReviewerAssignments(authenticatedActor(request)) },
    }),
  );
  app.patch<{ Params: { escalationId: string } }>(
    '/api/v1/admin/escalations/:escalationId/reviewer',
    { preHandler: [authenticate, admin, sameOrigin, csrf] },
    async (request, reply) => {
      const { reviewerId } = body(reviewerAssignmentSchema, request.body);
      await workflows.assignReviewer(
        authenticatedActor(request),
        parseUuid(request.params.escalationId),
        reviewerId,
        request.id,
      );
      return reply.status(204).send();
    },
  );
}
