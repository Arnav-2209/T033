import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { requireIsolatedTestDatabase } from '../../../testing/require-isolated-test-database.js';
import { loadEnvironment } from '../../../config/env.js';
import { createPrismaClient } from '../../../infrastructure/database/client.js';
import { LocalEvidenceStorage } from '../../../infrastructure/storage/local-evidence-storage.js';
import { PrismaAuthRepository } from '../../../infrastructure/repositories/prisma-auth-repository.js';
import { PrismaGrievanceRepository } from '../../../infrastructure/repositories/prisma-grievance-repository.js';
import { buildApp } from '../../../app.js';

const environment = loadEnvironment();
if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required for integration tests.');
requireIsolatedTestDatabase(environment.DATABASE_URL);
if (!environment.DATABASE_URL)
  throw new Error('DATABASE_URL is required for grievance integration tests.');
if (!process.env.SGRS_SEED_PASSWORD)
  throw new Error('SGRS_SEED_PASSWORD is required for grievance integration tests.');

const prisma = createPrismaClient(environment.DATABASE_URL);
let app: FastifyInstance;
let storagePath = '';
let studentCookie = '';
let csrfToken = '';

async function signInStudent(): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: environment.WEB_ORIGIN },
    payload: {
      email: 'aditi.rao@student.demo.sgrs.local',
      password: process.env.SGRS_SEED_PASSWORD,
    },
  });
  expect(response.statusCode).toBe(200);
  const setCookies = response.headers['set-cookie'];
  const cookies = Array.isArray(setCookies) ? setCookies : [setCookies];
  const session = cookies.find(
    (item) => typeof item === 'string' && item.startsWith('sgrs_session='),
  );
  const csrf = cookies.find((item) => typeof item === 'string' && item.startsWith('sgrs_csrf='));
  if (typeof session !== 'string' || typeof csrf !== 'string')
    throw new Error('Expected session and CSRF cookies.');
  const sessionPair = session.split(';', 1)[0];
  const csrfPair = csrf.split(';', 1)[0];
  if (!sessionPair || !csrfPair) throw new Error('Authentication cookie pairs are empty.');
  studentCookie = `${sessionPair}; ${csrfPair}`;
  csrfToken = csrfPair.slice('sgrs_csrf='.length);
}

function mutationHeaders() {
  return {
    origin: environment.WEB_ORIGIN,
    cookie: studentCookie,
    'x-csrf-token': csrfToken,
  };
}

describe('Phase 3 grievance API and persistence', () => {
  beforeAll(async () => {
    await prisma.$connect();
    storagePath = await mkdtemp(join(tmpdir(), 'sgrs-phase3-evidence-'));
    app = await buildApp(environment, {
      authRepository: new PrismaAuthRepository(prisma),
      grievanceRepository: new PrismaGrievanceRepository(prisma),
      evidenceStorage: new LocalEvidenceStorage(storagePath),
    });
    await signInStudent();
  });

  afterAll(async () => {
    await app?.close();
    if (storagePath) await rm(storagePath, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it('saves a draft, validates owner edits, uploads private evidence, and submits exactly once with a frozen SLA', async () => {
    const categories = await app.inject({
      method: 'GET',
      url: '/api/v1/student/grievance-categories',
      headers: { cookie: studentCookie },
    });
    expect(categories.statusCode).toBe(200);
    const hostel = categories
      .json()
      .data.items.find((item: { name: string }) => item.name === 'Hostel/Infrastructure');
    expect(hostel).toBeDefined();

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/student/grievances',
      headers: mutationHeaders(),
    });
    expect(created.statusCode).toBe(201);
    const draft = created.json().data;

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/student/grievances/${draft.id}`,
      headers: mutationHeaders(),
      payload: {
        version: draft.version,
        title: 'Student concern integration fixture',
        description: 'A test report for the grievance lifecycle.',
        categoryId: hostel.id,
        incidentDate: new Date().toISOString().slice(0, 10),
      },
    });
    expect(updated.statusCode).toBe(200);

    const boundary = `sgrs-${crypto.randomUUID()}`;
    const fileBytes = '%PDF-1.7\nPhase 3 integration fixture';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="evidence.pdf"\r\nContent-Type: application/pdf\r\n\r\n${fileBytes}\r\n--${boundary}--\r\n`;
    const upload = await app.inject({
      method: 'POST',
      url: `/api/v1/student/grievances/${draft.id}/evidence`,
      headers: {
        ...mutationHeaders(),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: body,
    });
    expect(upload.statusCode).toBe(201);
    expect(upload.json().data.items).toHaveLength(1);

    const key = crypto.randomUUID();
    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/student/grievances/${draft.id}/submit`,
      headers: { ...mutationHeaders(), 'idempotency-key': key },
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().data).toMatchObject({
      status: 'ASSIGNED',
      caseNumber: expect.stringMatching(/^SGRS-/),
      slaHoursSnapshot: 120,
      slaPolicyVersion: expect.any(Number),
    });
    expect(submitted.json().data.evidence).toHaveLength(1);
    const evidenceId = submitted.json().data.evidence[0].id as string;
    expect(
      submitted.json().data.statusHistory.map((entry: { newStatus: string }) => entry.newStatus),
    ).toEqual(['DRAFT', 'SUBMITTED', 'ASSIGNED']);

    const retried = await app.inject({
      method: 'POST',
      url: `/api/v1/student/grievances/${draft.id}/submit`,
      headers: { ...mutationHeaders(), 'idempotency-key': key },
    });
    expect(retried.statusCode).toBe(200);
    expect(retried.json().data.id).toBe(submitted.json().data.id);
    const concurrentRetries = await Promise.all(
      [0, 1].map(() =>
        app.inject({
          method: 'POST',
          url: `/api/v1/student/grievances/${draft.id}/submit`,
          headers: { ...mutationHeaders(), 'idempotency-key': key },
        }),
      ),
    );
    expect(concurrentRetries.map((response) => response.statusCode)).toEqual([200, 200]);
    expect(concurrentRetries.map((response) => response.json().data.id)).toEqual([
      submitted.json().data.id,
      submitted.json().data.id,
    ]);
    expect(await prisma.assignment.count({ where: { grievanceId: draft.id, endedAt: null } })).toBe(
      1,
    );

    const managementLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: environment.WEB_ORIGIN },
      payload: {
        email: 'management@demo.sgrs.local',
        password: process.env.SGRS_SEED_PASSWORD,
      },
    });
    const managementCookies = managementLogin.headers['set-cookie'];
    const cookieParts = Array.isArray(managementCookies) ? managementCookies : [managementCookies];
    const managementSession = cookieParts.find(
      (item) => typeof item === 'string' && item.startsWith('sgrs_session='),
    );
    const managementCsrf = cookieParts.find(
      (item) => typeof item === 'string' && item.startsWith('sgrs_csrf='),
    );
    if (typeof managementSession !== 'string' || typeof managementCsrf !== 'string') {
      throw new Error('Management login did not return authentication cookies.');
    }
    const evidenceDenied = await app.inject({
      method: 'GET',
      url: `/api/v1/grievances/${draft.id}/evidence/${evidenceId}`,
      headers: {
        cookie: `${managementSession.split(';', 1)[0]}; ${managementCsrf.split(';', 1)[0]}`,
      },
    });
    expect(evidenceDenied.statusCode).toBe(403);
  });

  it('routes an unconfigured category to pending manual assignment and denies management case access', async () => {
    const other = await prisma.category.findUniqueOrThrow({ where: { name: 'Other' } });
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/student/grievances',
      headers: mutationHeaders(),
    });
    const draft = created.json().data;
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/student/grievances/${draft.id}`,
      headers: mutationHeaders(),
      payload: {
        version: draft.version,
        title: 'Manual assignment test concern',
        description: 'A test for manual assignment.',
        categoryId: other.id,
        incidentDate: new Date().toISOString().slice(0, 10),
      },
    });
    expect(updated.statusCode).toBe(200);
    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/student/grievances/${draft.id}/submit`,
      headers: { ...mutationHeaders(), 'idempotency-key': crypto.randomUUID() },
    });
    expect(submitted.statusCode).toBe(200);
    expect(submitted.json().data.status).toBe('PENDING_MANUAL_ASSIGNMENT');
    expect(submitted.json().data.assignedHandlerName).toBeNull();
    expect(
      await prisma.notification.count({
        where: { grievanceId: draft.id, type: 'MANUAL_ASSIGNMENT_REQUIRED' },
      }),
    ).toBeGreaterThan(0);

    const management = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: environment.WEB_ORIGIN },
      payload: { email: 'management@demo.sgrs.local', password: process.env.SGRS_SEED_PASSWORD },
    });
    const managementCookie = management.headers['set-cookie'];
    const cookies = Array.isArray(managementCookie) ? managementCookie : [managementCookie];
    const session = cookies.find(
      (item) => typeof item === 'string' && item.startsWith('sgrs_session='),
    );
    const csrf = cookies.find((item) => typeof item === 'string' && item.startsWith('sgrs_csrf='));
    if (typeof session !== 'string' || typeof csrf !== 'string') {
      throw new Error('Management login did not return authentication cookies.');
    }
    const sessionPair = session.split(';', 1)[0];
    const csrfPair = csrf.split(';', 1)[0];
    if (!sessionPair || !csrfPair)
      throw new Error('Management authentication cookie pairs are empty.');
    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/grievances/${draft.id}`,
      headers: { cookie: `${sessionPair}; ${csrfPair}` },
    });
    expect(denied.statusCode).toBe(403);
  });
});
