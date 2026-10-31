import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Environment } from '../../../config/env.js';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import type { AuthService, AuthenticatedActor } from '../application/auth-service.js';

declare module 'fastify' {
  interface FastifyRequest {
    actor: AuthenticatedActor | null;
  }
}

export function authCookieNames(environment: Environment): { session: string; csrf: string } {
  return environment.NODE_ENV === 'production'
    ? { session: '__Host-sgrs_session', csrf: '__Host-sgrs_csrf' }
    : { session: 'sgrs_session', csrf: 'sgrs_csrf' };
}

export function setSessionCookies(
  reply: FastifyReply,
  environment: Environment,
  sessionToken: string,
  csrfToken: string,
  expiresAt: Date,
): void {
  const names = authCookieNames(environment);
  const secure = environment.NODE_ENV === 'production';
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1_000));
  reply.setCookie(names.session, sessionToken, {
    path: '/',
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge,
  });
  reply.setCookie(names.csrf, csrfToken, {
    path: '/',
    httpOnly: false,
    secure,
    sameSite: 'lax',
    maxAge,
  });
}

export function clearSessionCookies(reply: FastifyReply, environment: Environment): void {
  const names = authCookieNames(environment);
  const secure = environment.NODE_ENV === 'production';
  const options = { path: '/', secure, sameSite: 'lax' as const };
  reply.clearCookie(names.session, options);
  reply.clearCookie(names.csrf, options);
}

export function requireSameOrigin(environment: Environment) {
  const expectedOrigin = new URL(environment.WEB_ORIGIN).origin;
  return async (request: FastifyRequest): Promise<void> => {
    const source = request.headers.origin ?? request.headers.referer;
    let sourceOrigin: string | undefined;
    if (source) {
      try {
        sourceOrigin = new URL(source).origin;
      } catch {
        sourceOrigin = undefined;
      }
    }
    if (sourceOrigin !== expectedOrigin) {
      throw new AppError(403, 'ORIGIN_REJECTED', 'This request origin is not allowed.');
    }
  };
}

export function requireAuthentication(authService: AuthService, environment: Environment) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const cookieNames = authCookieNames(environment);
    const actor = await authService.authenticate(request.cookies[cookieNames.session], request.id);
    if (!actor) {
      clearSessionCookies(reply, environment);
      throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    }
    request.actor = actor;
  };
}

export function requireRoles(...roles: AuthenticatedActor['role'][]) {
  return async (request: FastifyRequest): Promise<void> => {
    if (!request.actor) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    if (!roles.includes(request.actor.role)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to perform this action.');
    }
  };
}

export function authenticatedActor(request: FastifyRequest): AuthenticatedActor {
  if (!request.actor) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  return request.actor;
}

export function requireCsrf(authService: AuthService, environment: Environment) {
  return async (request: FastifyRequest): Promise<void> => {
    const actor = request.actor;
    if (!actor) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const cookieName = authCookieNames(environment).csrf;
    const cookieToken = request.cookies[cookieName];
    const headerToken = request.headers['x-csrf-token'];
    const sameTokens = Boolean(cookieToken && headerToken && cookieToken === headerToken);
    if (!sameTokens || !authService.csrfMatches(actor, cookieToken)) {
      throw new AppError(403, 'CSRF_REJECTED', 'Refresh your session and try again.');
    }
  };
}

export function decorateActor(app: FastifyInstance): void {
  app.decorateRequest('actor', null);
}
