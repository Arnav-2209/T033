import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Environment } from './config/env.js';
import { AppError } from './infrastructure/errors/app-error.js';
import type { AuthRepository } from './modules/auth/application/ports.js';
import { AuthService } from './modules/auth/application/auth-service.js';
import { decorateActor } from './modules/auth/http/security.js';
import { registerAuthRoutes } from './modules/auth/http/routes.js';
import { registerHealthRoutes } from './modules/health/routes.js';
import { UserService } from './modules/users/application/user-service.js';
import { registerUserRoutes } from './modules/users/http/routes.js';
import type { GrievanceRepository } from './modules/grievances/application/ports.js';
import { GrievanceService } from './modules/grievances/application/grievance-service.js';
import { EvidenceService } from './modules/grievances/application/evidence-service.js';
import { registerGrievanceRoutes } from './modules/grievances/http/routes.js';
import { CaseWorkflowService } from './modules/grievances/application/case-workflow-service.js';
import { registerWorkflowRoutes } from './modules/grievances/http/workflow-routes.js';
import type { EvidenceStorage } from './modules/grievances/application/storage.js';

export interface AppDependencies {
  checkDatabase?: () => Promise<void>;
  authRepository?: AuthRepository;
  grievanceRepository?: GrievanceRepository;
  evidenceStorage?: EvidenceStorage;
}

function getStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined;
  return typeof error.statusCode === 'number' ? error.statusCode : undefined;
}

export async function buildApp(
  environment: Environment,
  dependencies: AppDependencies = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: environment.NODE_ENV !== 'test',
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(cookie);
  await app.register(multipart, {
    throwFileSizeLimit: false,
    limits: { fileSize: 5 * 1024 * 1024 + 1, fields: 0, files: 10, parts: 10 },
  });
  await app.register(helmet);
  await app.register(cors, {
    origin: environment.WEB_ORIGIN,
    credentials: true,
  });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await registerHealthRoutes(app, dependencies.checkDatabase);

  if (dependencies.authRepository) {
    decorateActor(app);
    const authService = new AuthService(dependencies.authRepository, {
      idleTimeoutMinutes: environment.SESSION_IDLE_TIMEOUT_MINUTES,
      absoluteTimeoutHours: environment.SESSION_ABSOLUTE_TIMEOUT_HOURS,
    });
    const userService = new UserService(dependencies.authRepository);
    await registerAuthRoutes(app, authService, environment);
    await registerUserRoutes(app, authService, userService, environment);
    if (dependencies.grievanceRepository && dependencies.evidenceStorage) {
      const grievanceService = new GrievanceService(
        dependencies.grievanceRepository,
        environment.INSTITUTION_TIME_ZONE,
      );
      const evidenceService = new EvidenceService(
        dependencies.grievanceRepository,
        dependencies.evidenceStorage,
      );
      await registerGrievanceRoutes(
        app,
        authService,
        grievanceService,
        evidenceService,
        environment,
      );
      await registerWorkflowRoutes(
        app,
        authService,
        new CaseWorkflowService(dependencies.grievanceRepository),
        environment,
      );
    }
  }

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Unhandled request error');
    const statusCode = getStatusCode(error);
    const isClientError = statusCode !== undefined && statusCode < 500;
    const code =
      error instanceof AppError
        ? error.code
        : statusCode === 429
          ? 'TOO_MANY_REQUESTS'
          : isClientError
            ? 'REQUEST_FAILED'
            : 'INTERNAL_ERROR';

    return reply.status(statusCode ?? 500).send({
      error: {
        code,
        message:
          error instanceof AppError || (isClientError && error instanceof Error)
            ? error.message
            : 'An unexpected error occurred.',
        requestId: request.id,
        ...(error instanceof AppError && error.details !== undefined
          ? { details: error.details }
          : {}),
      },
    });
  });

  return app;
}
