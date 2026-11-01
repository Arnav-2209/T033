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
import type { ResolutionService } from '../application/resolution-service.js';

const uuid = z.string().uuid();
const remarksSchema = z.object({ remarks: z.string() }).strict();
const feedbackSchema = z.object({ rating: z.number(), comment: z.string().optional() }).strict();

function parseUuid(value: string): string {
  const parsed = uuid.safeParse(value);
  if (!parsed.success)
    throw new AppError(400, 'VALIDATION_FAILED', 'A valid grievance identifier is required.');
  return parsed.data;
}

function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Check the request fields and try again.');
  }
  return parsed.data;
}

export async function registerResolutionRoutes(
  app: FastifyInstance,
  auth: AuthService,
  resolutions: ResolutionService,
  environment: Environment,
): Promise<void> {
  const authenticate = requireAuthentication(auth, environment);
  const sameOrigin = requireSameOrigin(environment);
  const csrf = requireCsrf(auth, environment);

  for (const role of ['HANDLER', 'REVIEWER'] as const) {
    app.post<{ Params: { grievanceId: string }; Body: { remarks: string } }>(
      `/api/v1/${role.toLowerCase()}/grievances/:grievanceId/resolve`,
      { preHandler: [authenticate, requireRoles(role), sameOrigin, csrf] },
      async (request) => ({
        data: await resolutions.resolve(
          authenticatedActor(request),
          parseUuid(request.params.grievanceId),
          parseBody(remarksSchema, request.body).remarks,
          request.id,
        ),
      }),
    );
  }

  app.post<{ Params: { grievanceId: string }; Body: { rating: number; comment?: string } }>(
    '/api/v1/student/grievances/:grievanceId/feedback',
    { preHandler: [authenticate, requireRoles('STUDENT'), sameOrigin, csrf] },
    async (request) => {
      const parsed = feedbackSchema.safeParse(request.body);
      if (!parsed.success)
        throw new AppError(
          400,
          'VALIDATION_FAILED',
          'Provide a rating from 1 to 5 and an optional comment.',
        );
      return {
        data: await resolutions.submitFeedback(
          authenticatedActor(request),
          parseUuid(request.params.grievanceId),
          parsed.data.rating,
          parsed.data.comment ?? null,
          request.id,
        ),
      };
    },
  );
}
