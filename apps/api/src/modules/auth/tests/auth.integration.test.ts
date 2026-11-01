import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireIsolatedTestDatabase } from '../../../testing/require-isolated-test-database.js';
import { loadEnvironment } from '../../../config/env.js';
import { createPrismaClient } from '../../../infrastructure/database/client.js';
import { PrismaAuthRepository } from '../../../infrastructure/repositories/prisma-auth-repository.js';
import { hashToken } from '../../../infrastructure/security/session-token.js';
import { buildApp } from '../../../app.js';
import type { FastifyInstance } from 'fastify';

const environment = loadEnvironment();
if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required for integration tests.');
requireIsolatedTestDatabase(environment.DATABASE_URL);
if (!environment.DATABASE_URL)
  throw new Error('DATABASE_URL is required for auth integration tests.');
if (!process.env.SGRS_SEED_PASSWORD)
  throw new Error('SGRS_SEED_PASSWORD is required for auth integration tests.');

const demoPassword = process.env.SGRS_SEED_PASSWORD;
const prisma = createPrismaClient(environment.DATABASE_URL);
const repository = new PrismaAuthRepository(prisma);
let app: FastifyInstance;

const accounts = [
  { email: 'aditi.rao@student.demo.sgrs.local', role: 'STUDENT' },
  { email: 'ramesh.kumar@staff.demo.sgrs.local', role: 'HANDLER' },
  { email: 'hostel.committee@staff.demo.sgrs.local', role: 'REVIEWER' },
  { email: 'admin@demo.sgrs.local', role: 'ADMINISTRATOR' },
  { email: 'management@demo.sgrs.local', role: 'MANAGEMENT' },
] as const;

type AuthCookies = { session: string; csrf: string };

function cookiesFrom(response: { headers: Record<string, unknown> }): AuthCookies {
  const header = response.headers['set-cookie'];
  const items = Array.isArray(header) ? header : [header];
  const cookies = items.filter((item): item is string => typeof item === 'string');
  const session = cookies.find((item) => item.startsWith('sgrs_session='));
  const csrf = cookies.find((item) => item.startsWith('sgrs_csrf='));
  if (!session || !csrf) throw new Error('Authentication response did not set both cookies.');
  const sessionPair = session.split(';', 1)[0];
  const csrfPair = csrf.split(';', 1)[0];
  if (!sessionPair || !csrfPair) throw new Error('Authentication cookies were malformed.');
  return {
    session: sessionPair,
    csrf: csrfPair,
  };
}

async function signIn(email: string): Promise<{ cookies: AuthCookies; user: { role: string } }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: environment.WEB_ORIGIN },
    payload: { email, password: demoPassword },
  });
  if (response.statusCode !== 200)
    throw new Error(`Sign-in failed for ${email}: ${response.statusCode}`);
  return { cookies: cookiesFrom(response), user: response.json().data.user };
}

function cookieHeader(cookies: AuthCookies): string {
  return `${cookies.session}; ${cookies.csrf}`;
}

describe('Phase 2 authentication and account authorization', () => {
  beforeAll(async () => {
    await prisma.$connect();
    app = await buildApp(environment, { authRepository: repository });
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
  });

  it('authenticates each seeded role, gates administrator routes, and revokes logout sessions', async () => {
    for (const expected of accounts) {
      const { cookies, user } = await signIn(expected.email);
      expect(user.role).toBe(expected.role);

      const session = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        headers: { cookie: cookieHeader(cookies) },
      });
      expect(session.statusCode).toBe(200);
      expect(session.json().data.user.role).toBe(expected.role);
      expect(session.json().data.user.passwordHash).toBeUndefined();

      const adminRoute = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/users',
        headers: { cookie: cookieHeader(cookies) },
      });
      expect(adminRoute.statusCode).toBe(expected.role === 'ADMINISTRATOR' ? 200 : 403);

      const logout = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        headers: {
          origin: environment.WEB_ORIGIN,
          cookie: cookieHeader(cookies),
          'x-csrf-token': cookies.csrf.slice('sgrs_csrf='.length),
        },
      });
      expect(logout.statusCode).toBe(204);

      const revoked = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        headers: { cookie: cookieHeader(cookies) },
      });
      expect(revoked.statusCode).toBe(401);
    }
  });

  it('uses one generic credential response for unknown, wrong-password, and inactive accounts', async () => {
    const known = accounts[0].email;
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: environment.WEB_ORIGIN },
      payload: { email: known, password: 'incorrect-demo-password' },
    });
    const unknownAccount = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: environment.WEB_ORIGIN },
      payload: { email: 'unknown@demo.sgrs.local', password: 'incorrect-demo-password' },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownAccount.statusCode).toBe(401);
    expect(wrongPassword.json().error.code).toBe(unknownAccount.json().error.code);
    expect(wrongPassword.json().error.message).toBe(unknownAccount.json().error.message);

    const admin = await signIn('admin@demo.sgrs.local');
    const student = await signIn(known);
    const studentAccount = await prisma.user.findUniqueOrThrow({ where: { email: known } });
    const adminHeaders = {
      origin: environment.WEB_ORIGIN,
      cookie: cookieHeader(admin.cookies),
      'x-csrf-token': admin.cookies.csrf.slice('sgrs_csrf='.length),
    };

    const disabled = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${studentAccount.id}`,
      headers: adminHeaders,
      payload: { isActive: false },
    });
    expect(disabled.statusCode).toBe(200);
    const disabledSession = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { cookie: cookieHeader(student.cookies) },
    });
    expect(disabledSession.statusCode).toBe(401);

    try {
      const inactive = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin: environment.WEB_ORIGIN },
        payload: { email: known, password: demoPassword },
      });
      expect(inactive.statusCode).toBe(401);
      expect(inactive.json().error.message).toBe(wrongPassword.json().error.message);
    } finally {
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/admin/users/${studentAccount.id}`,
        headers: adminHeaders,
        payload: { isActive: true },
      });
    }
  });

  it('limits repeated authentication attempts by source and normalized account', async () => {
    const email = `rate-limit-${crypto.randomUUID()}@example.test`;
    const attempts = [];
    for (let index = 0; index < 10; index += 1) {
      attempts.push(
        await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: { origin: environment.WEB_ORIGIN },
          payload: { email, password: 'incorrect-demo-password' },
        }),
      );
    }
    expect(attempts.every((response) => response.statusCode === 401)).toBe(true);

    const limited = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: environment.WEB_ORIGIN },
      payload: { email, password: 'incorrect-demo-password' },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('TOO_MANY_REQUESTS');
  });

  it('revokes a user’s sessions and audits role changes; it prevents removing the last administrator', async () => {
    const admin = await signIn('admin@demo.sgrs.local');
    const adminAccount = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@demo.sgrs.local' },
    });
    const student = await signIn(accounts[0].email);
    const studentAccount = await prisma.user.findUniqueOrThrow({
      where: { email: accounts[0].email },
    });

    const change = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${studentAccount.id}`,
      headers: {
        origin: environment.WEB_ORIGIN,
        cookie: cookieHeader(admin.cookies),
        'x-csrf-token': admin.cookies.csrf.slice('sgrs_csrf='.length),
      },
      payload: { role: 'HANDLER' },
    });
    expect(change.statusCode).toBe(200);
    expect(change.json().data.role).toBe('HANDLER');

    const oldSession = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { cookie: cookieHeader(student.cookies) },
    });
    expect(oldSession.statusCode).toBe(401);

    const auditEvent = await prisma.auditLog.findFirst({
      where: {
        action: 'ADMIN_USER_UPDATED',
        entityId: studentAccount.id,
        actorId: adminAccount.id,
      },
      orderBy: { occurredAt: 'desc' },
    });
    expect(auditEvent?.details).toMatchObject({ changedFields: ['role'] });

    const selfDemotion = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${adminAccount.id}`,
      headers: {
        origin: environment.WEB_ORIGIN,
        cookie: cookieHeader(admin.cookies),
        'x-csrf-token': admin.cookies.csrf.slice('sgrs_csrf='.length),
      },
      payload: { role: 'STUDENT' },
    });
    expect(selfDemotion.statusCode).toBe(409);

    const restore = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${studentAccount.id}`,
      headers: {
        origin: environment.WEB_ORIGIN,
        cookie: cookieHeader(admin.cookies),
        'x-csrf-token': admin.cookies.csrf.slice('sgrs_csrf='.length),
      },
      payload: { role: 'STUDENT' },
    });
    expect(restore.statusCode).toBe(200);
  });

  it('requires CSRF proof and revokes every active session on logout-all', async () => {
    const first = await signIn(accounts[1].email);
    const second = await signIn(accounts[1].email);
    const invalidCsrf = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout-all',
      headers: {
        origin: environment.WEB_ORIGIN,
        cookie: cookieHeader(first.cookies),
        'x-csrf-token': 'incorrect-token',
      },
    });
    expect(invalidCsrf.statusCode).toBe(403);

    const logoutAll = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout-all',
      headers: {
        origin: environment.WEB_ORIGIN,
        cookie: cookieHeader(first.cookies),
        'x-csrf-token': first.cookies.csrf.slice('sgrs_csrf='.length),
      },
    });
    expect(logoutAll.statusCode).toBe(200);
    expect(logoutAll.json().data.revokedCount).toBeGreaterThanOrEqual(2);

    for (const cookies of [first.cookies, second.cookies]) {
      const session = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        headers: { cookie: cookieHeader(cookies) },
      });
      expect(session.statusCode).toBe(401);
    }
  });

  it('changes the password atomically, rotates the current session, and invalidates the old one', async () => {
    const known = accounts[0].email;
    const account = await prisma.user.findUniqueOrThrow({ where: { email: known } });
    const originalHash = account.passwordHash;
    const current = await signIn(known);
    const newPassword = 'PhaseTwo-Temp!2026';

    try {
      const change = await app.inject({
        method: 'PATCH',
        url: '/api/v1/auth/password',
        headers: {
          origin: environment.WEB_ORIGIN,
          cookie: cookieHeader(current.cookies),
          'x-csrf-token': current.cookies.csrf.slice('sgrs_csrf='.length),
        },
        payload: { currentPassword: demoPassword, newPassword },
      });
      expect(change.statusCode).toBe(200);
      expect(change.json().data.user.passwordHash).toBeUndefined();

      const rotated = cookiesFrom(change);
      const oldSession = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        headers: { cookie: cookieHeader(current.cookies) },
      });
      const newSession = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/session',
        headers: { cookie: cookieHeader(rotated) },
      });
      expect(oldSession.statusCode).toBe(401);
      expect(newSession.statusCode).toBe(200);

      const canSignInWithChangedPassword = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        headers: { origin: environment.WEB_ORIGIN },
        payload: { email: known, password: newPassword },
      });
      expect(canSignInWithChangedPassword.statusCode).toBe(200);

      const revokeRotated = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout-all',
        headers: {
          origin: environment.WEB_ORIGIN,
          cookie: cookieHeader(rotated),
          'x-csrf-token': rotated.csrf.slice('sgrs_csrf='.length),
        },
      });
      expect(revokeRotated.statusCode).toBe(200);
    } finally {
      await prisma.user.update({ where: { id: account.id }, data: { passwordHash: originalHash } });
    }
  });

  it('expires an absolute session and keeps only a one-way session token hash in PostgreSQL', async () => {
    const { cookies } = await signIn(accounts[4].email);
    const token = cookies.session.slice('sgrs_session='.length);
    const session = await prisma.session.findUniqueOrThrow({
      where: { tokenHash: new Uint8Array(hashToken(token)) },
    });
    expect(Buffer.from(session.tokenHash).toString('utf8')).not.toContain(token);
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/session',
      headers: { cookie: cookieHeader(cookies) },
    });
    expect(response.statusCode).toBe(401);
  });
});
