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
import type { NotificationService } from '../application/notification-service.js';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export async function registerNotificationRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: NotificationService,
  environment: Environment,
): Promise<void> {
  const authenticate = requireAuthentication(auth, environment);
  const sameOrigin = requireSameOrigin(environment);
  const csrf = requireCsrf(auth, environment);
  const notificationUser = requireRoles('STUDENT', 'HANDLER', 'REVIEWER', 'ADMINISTRATOR');

  app.get(
    '/api/v1/notifications',
    { preHandler: [authenticate, notificationUser] },
    async (request) => {
      const parsed = querySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_FAILED', 'Check the notification page values.');
      }
      return { data: await service.list(authenticatedActor(request), parsed.data) };
    },
  );

  app.patch<{ Params: { notificationId: string } }>(
    '/api/v1/notifications/:notificationId/read',
    { preHandler: [authenticate, notificationUser, sameOrigin, csrf] },
    async (request, reply) => {
      await service.markRead(authenticatedActor(request), request.params.notificationId);
      return reply.status(204).send();
    },
  );
}
