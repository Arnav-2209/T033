import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Environment } from '../../../config/env.js';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import type { AuthService } from '../../auth/application/auth-service.js';
import {
  authenticatedActor,
  requireAuthentication,
  requireRoles,
} from '../../auth/http/security.js';
import type { ReportService } from '../application/report-service.js';

const periodSchema = z
  .object({
    from: z.string().datetime({ offset: true }),
    to: z.string().datetime({ offset: true }),
  })
  .strict();
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const uuid = z.string().uuid();

function period(value: unknown): { from: Date; to: Date } {
  const parsed = periodSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Provide ISO 8601 UTC instants for from and to.');
  }
  const from = new Date(parsed.data.from);
  const to = new Date(parsed.data.to);
  if (from >= to) {
    throw new AppError(
      400,
      'INVALID_REPORT_PERIOD',
      'The report start must be earlier than its end.',
    );
  }
  return { from, to };
}

export async function registerReportRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ReportService,
  environment: Environment,
): Promise<void> {
  const authenticate = requireAuthentication(auth, environment);
  const admin = requireRoles('ADMINISTRATOR');
  const adminOrManagement = requireRoles('ADMINISTRATOR', 'MANAGEMENT');

  app.get(
    '/api/v1/admin/reports/overview',
    { preHandler: [authenticate, admin] },
    async (request) => ({
      data: await service.overview(authenticatedActor(request)),
    }),
  );

  app.get(
    '/api/v1/management/reports/overview',
    { preHandler: [authenticate, requireRoles('MANAGEMENT')] },
    async (request) => ({ data: await service.overview(authenticatedActor(request)) }),
  );

  app.get(
    '/api/v1/admin/reports/categories',
    { preHandler: [authenticate, adminOrManagement] },
    async (request) => ({
      data: await service.categoryReport(authenticatedActor(request), period(request.query)),
    }),
  );

  app.get(
    '/api/v1/management/reports/categories',
    { preHandler: [authenticate, requireRoles('MANAGEMENT')] },
    async (request) => ({
      data: await service.categoryReport(authenticatedActor(request), period(request.query)),
    }),
  );

  app.get(
    '/api/v1/admin/reports/handlers',
    { preHandler: [authenticate, admin] },
    async (request) => ({
      data: await service.handlerReport(authenticatedActor(request), period(request.query)),
    }),
  );

  app.get<{ Params: { grievanceId: string } }>(
    '/api/v1/admin/grievances/:grievanceId/audit',
    { preHandler: [authenticate, admin] },
    async (request) => {
      const grievanceId = uuid.safeParse(request.params.grievanceId);
      const paging = pageSchema.safeParse(request.query);
      if (!grievanceId.success || !paging.success) {
        throw new AppError(400, 'VALIDATION_FAILED', 'Check the audit trail identifier and page.');
      }
      return {
        data: await service.auditTrail(authenticatedActor(request), {
          grievanceId: grievanceId.data,
          ...paging.data,
        }),
      };
    },
  );
}
