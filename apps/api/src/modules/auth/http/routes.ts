import type { AuthSessionResponse } from '@sgrs/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Environment } from '../../../config/env.js';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import type { AuthService } from '../application/auth-service.js';
import {
  authCookieNames,
  authenticatedActor,
  clearSessionCookies,
  requireAuthentication,
  requireCsrf,
  requireSameOrigin,
  setSessionCookies,
} from './security.js';

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(1_024),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(1_024),
  newPassword: z.string().min(1).max(1_024),
});

function invalidBody(): never {
  throw new AppError(400, 'VALIDATION_FAILED', 'Check the request fields and try again.');
}

function userAgent(request: FastifyRequest): string | undefined {
  return request.headers['user-agent'];
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  authService: AuthService,
  environment: Environment,
): Promise<void> {
  const authenticate = requireAuthentication(authService, environment);
  const csrf = requireCsrf(authService, environment);
  const sameOrigin = requireSameOrigin(environment);

  const loginLimit = app.rateLimit({
    max: environment.AUTH_LOGIN_MAX_ATTEMPTS,
    timeWindow: environment.AUTH_LOGIN_WINDOW_SECONDS * 1_000,
    hook: 'preHandler',
    keyGenerator: (request) => {
      const body = request.body as { email?: unknown } | undefined;
      const accountKey =
        typeof body?.email === 'string' ? body.email.trim().toLowerCase() : 'unknown';
      return `${request.ip}:${accountKey}`;
    },
  });

  app.post(
    '/api/v1/auth/login',
    {
      // The global plugin would mark this request as already rate limited
      // before the account/IP-specific preHandler runs. Exclude it from the
      // global bucket so the stricter login limiter is actually enforced.
      config: { rateLimit: false },
      preHandler: [sameOrigin, loginLimit],
    },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) invalidBody();
      const agent = userAgent(request);
      const session = await authService.login({
        ...parsed.data,
        ...(agent ? { userAgent: agent } : {}),
        requestId: request.id,
      });
      setSessionCookies(
        reply,
        environment,
        session.sessionToken,
        session.csrfToken,
        session.expiresAt,
      );
      const response: AuthSessionResponse = {
        data: { user: session.user, expiresAt: session.expiresAt.toISOString() },
      };
      return reply.status(200).send(response);
    },
  );

  app.get(
    '/api/v1/auth/session',
    { preHandler: [authenticate] },
    async (request): Promise<AuthSessionResponse> => {
      const actor = authenticatedActor(request);
      return {
        data: {
          user: {
            id: actor.userId,
            email: actor.email,
            name: actor.name,
            role: actor.role,
            departmentId: actor.departmentId,
            contact: actor.contact,
            isActive: actor.isActive,
            createdAt: actor.createdAt.toISOString(),
          },
          expiresAt: actor.expiresAt.toISOString(),
        },
      };
    },
  );

  app.get('/api/v1/me', { preHandler: [authenticate] }, async (request) => {
    const actor = authenticatedActor(request);
    return {
      data: {
        id: actor.userId,
        email: actor.email,
        name: actor.name,
        role: actor.role,
        departmentId: actor.departmentId,
        contact: actor.contact,
      },
    };
  });

  app.post('/api/v1/auth/logout', { preHandler: [sameOrigin] }, async (request, reply) => {
    const names = authCookieNames(environment);
    const actor = await authService.authenticate(request.cookies[names.session], request.id);
    if (actor) {
      request.actor = actor;
      const csrfToken = request.headers['x-csrf-token'];
      if (
        !csrfToken ||
        request.cookies[names.csrf] !== csrfToken ||
        !authService.csrfMatches(actor, csrfToken)
      ) {
        throw new AppError(403, 'CSRF_REJECTED', 'Refresh your session and try again.');
      }
      await authService.logout(actor, request.id);
    }
    clearSessionCookies(reply, environment);
    return reply.status(204).send();
  });

  app.post(
    '/api/v1/auth/logout-all',
    { preHandler: [authenticate, sameOrigin, csrf] },
    async (request, reply) => {
      const revokedCount = await authService.logoutAll(authenticatedActor(request), request.id);
      clearSessionCookies(reply, environment);
      return reply.status(200).send({ data: { revokedCount } });
    },
  );

  app.patch(
    '/api/v1/auth/password',
    { preHandler: [authenticate, sameOrigin, csrf] },
    async (request, reply) => {
      const parsed = passwordSchema.safeParse(request.body);
      if (!parsed.success) invalidBody();
      const agent = userAgent(request);
      const session = await authService.changePassword({
        actor: authenticatedActor(request),
        ...parsed.data,
        ...(agent ? { userAgent: agent } : {}),
        requestId: request.id,
      });
      setSessionCookies(
        reply,
        environment,
        session.sessionToken,
        session.csrfToken,
        session.expiresAt,
      );
      return reply.status(200).send({
        data: { user: session.user, expiresAt: session.expiresAt.toISOString() },
      });
    },
  );
}
