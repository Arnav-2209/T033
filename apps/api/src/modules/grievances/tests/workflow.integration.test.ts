import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { loadEnvironment } from '../../../config/env.js';
import { buildApp } from '../../../app.js';
import { createPrismaClient } from '../../../infrastructure/database/client.js';
import { PrismaAuthRepository } from '../../../infrastructure/repositories/prisma-auth-repository.js';
import { PrismaGrievanceRepository } from '../../../infrastructure/repositories/prisma-grievance-repository.js';
import { LocalEvidenceStorage } from '../../../infrastructure/storage/local-evidence-storage.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const environment = loadEnvironment();
if (!environment.DATABASE_URL || !process.env.SGRS_SEED_PASSWORD)
  throw new Error('Integration database and seeded demo password are required.');
const prisma = createPrismaClient(environment.DATABASE_URL);
let app: FastifyInstance;
let evidenceDirectory = '';
type Identity = { cookie: string; csrf: string };

async function signIn(email: string): Promise<Identity> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: environment.WEB_ORIGIN },
    payload: { email, password: process.env.SGRS_SEED_PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  const raw = response.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : [raw];
  const session = cookies.find((value) => value?.startsWith('sgrs_session='));
  const csrf = cookies.find((value) => value?.startsWith('sgrs_csrf='));
  if (!session || !csrf) throw new Error(`Login did not set session cookies for ${email}`);
  const sessionPair = session.split(';', 1)[0];
  const csrfPair = csrf.split(';', 1)[0];
  if (!sessionPair || !csrfPair) throw new Error('Session cookie pair was empty.');
  return { cookie: `${sessionPair}; ${csrfPair}`, csrf: csrfPair.slice('sgrs_csrf='.length) };
}

function headers(identity: Identity) {
  return { origin: environment.WEB_ORIGIN, cookie: identity.cookie, 'x-csrf-token': identity.csrf };
}

describe('Phase 4 handler and reviewer workflow', () => {
  beforeAll(async () => {
    await prisma.$connect();
    evidenceDirectory = await mkdtemp(join(tmpdir(), 'sgrs-phase4-evidence-'));
    app = await buildApp(environment, {
      authRepository: new PrismaAuthRepository(prisma),
      grievanceRepository: new PrismaGrievanceRepository(prisma),
      evidenceStorage: new LocalEvidenceStorage(evidenceDirectory),
    });
  });
  afterAll(async () => {
    await app?.close();
    if (evidenceDirectory) await rm(evidenceDirectory, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it('enforces assigned access and runs information, escalation, reviewer and manual-assignment workflows', async () => {
    const student = await signIn('aditi.rao@student.demo.sgrs.local');
    const handler = await signIn('ramesh.kumar@staff.demo.sgrs.local');
    const reviewer = await signIn('hostel.committee@staff.demo.sgrs.local');
    const admin = await signIn('admin@demo.sgrs.local');
    const management = await signIn('management@demo.sgrs.local');
    const categories = await app.inject({
      method: 'GET',
      url: '/api/v1/student/grievance-categories',
      headers: { cookie: student.cookie },
    });
    const hostel = categories
      .json()
      .data.items.find((entry: { name: string }) => entry.name === 'Hostel/Infrastructure');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/student/grievances',
      headers: headers(student),
    });
    const draft = created.json().data;
    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/student/grievances/${draft.id}`,
      headers: headers(student),
      payload: {
        version: draft.version,
        title: `Phase 4 workflow ${crypto.randomUUID()}`,
        description: 'A case used to verify the investigation workflow.',
        categoryId: hostel.id,
        incidentDate: new Date().toISOString().slice(0, 10),
      },
    });
    expect(updated.statusCode).toBe(200);
    const boundary = `phase4-${crypto.randomUUID()}`;
    const upload = await app.inject({
      method: 'POST',
      url: `/api/v1/student/grievances/${draft.id}/evidence`,
      headers: {
        ...headers(student),
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: `--${boundary}\r\nContent-Disposition: form-data; name="evidence"; filename="workflow.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7\nPhase 4 private evidence\r\n--${boundary}--\r\n`,
    });
    expect(upload.statusCode).toBe(201);
    const evidenceId = upload.json().data.items[0].id;
    const submitted = await app.inject({
      method: 'POST',
      url: `/api/v1/student/grievances/${draft.id}/submit`,
      headers: { ...headers(student), 'idempotency-key': crypto.randomUUID() },
    });
    expect(submitted.json().data.status).toBe('ASSIGNED');
    const handlerEvidence = await app.inject({
      method: 'GET',
      url: `/api/v1/grievances/${draft.id}/evidence/${evidenceId}`,
      headers: { cookie: handler.cookie },
    });
    expect(handlerEvidence.statusCode).toBe(200);
    const unauthorizedEvidence = await app.inject({
      method: 'GET',
      url: `/api/v1/grievances/${draft.id}/evidence/${evidenceId}`,
      headers: { cookie: management.cookie },
    });
    expect(unauthorizedEvidence.statusCode).toBe(403);

    const forbiddenStart = await app.inject({
      method: 'POST',
      url: `/api/v1/handler/grievances/${draft.id}/start-review`,
      headers: headers(management),
    });
    expect(forbiddenStart.statusCode).toBe(403);
    const started = await app.inject({
      method: 'POST',
      url: `/api/v1/handler/grievances/${draft.id}/start-review`,
      headers: headers(handler),
    });
    expect(started.statusCode).toBe(200);
    const invalidSecondStart = await app.inject({
      method: 'POST',
      url: `/api/v1/handler/grievances/${draft.id}/start-review`,
      headers: headers(handler),
    });
    expect(invalidSecondStart.statusCode).toBe(409);
    const privateNote = await app.inject({
      method: 'POST',
      url: `/api/v1/handler/grievances/${draft.id}/internal-notes`,
      headers: headers(handler),
      payload: { body: 'Staff-only investigation finding.' },
    });
    expect(privateNote.statusCode).toBe(200);
    const info = await app.inject({
      method: 'POST',
      url: `/api/v1/handler/grievances/${draft.id}/information-requests`,
      headers: headers(handler),
      payload: { body: 'Please add the date the leak began.' },
    });
    expect(info.statusCode).toBe(200);
    const requestId = info
      .json()
      .data.messages.find(
        (message: { messageType: string }) => message.messageType === 'INFO_REQUEST',
      ).id;
    const studentDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/grievances/${draft.id}`,
      headers: { cookie: student.cookie },
    });
    expect(studentDetail.statusCode).toBe(200);
    expect(
      studentDetail
        .json()
        .data.messages.some((message: { body: string }) => message.body.includes('Staff-only')),
    ).toBe(false);
    expect(studentDetail.json().data.escalationLevels).toHaveLength(0);
    const responseToWrongRequest = await app.inject({
      method: 'POST',
      url: `/api/v1/student/grievances/${draft.id}/information-requests/${crypto.randomUUID()}/responses`,
      headers: headers(student),
      payload: { body: 'This response references a different request.' },
    });
    expect(responseToWrongRequest.statusCode).toBe(409);
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/student/grievances/${draft.id}/information-requests/${requestId}/responses`,
      headers: headers(student),
      payload: { body: 'It began last Monday.' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.status).toBe('UNDER_REVIEW');
    expect(
      response.json().data.messages.map((message: { messageType: string }) => message.messageType),
    ).toEqual(['INFO_REQUEST', 'STUDENT_RESPONSE']);
    const handlerDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/grievances/${draft.id}`,
      headers: { cookie: handler.cookie },
    });
    expect(
      handlerDetail
        .json()
        .data.messages.map((message: { messageType: string }) => message.messageType),
    ).toEqual(['INTERNAL_NOTE', 'INFO_REQUEST', 'STUDENT_RESPONSE']);
    const internalMessage = await prisma.caseMessage.findFirstOrThrow({
      where: { grievanceId: draft.id, messageType: 'INTERNAL_NOTE' },
    });
    await expect(
      prisma.caseMessage.update({
        where: { id: internalMessage.id },
        data: { body: 'Attempt to rewrite the immutable record.' },
      }),
    ).rejects.toThrow();

    const noReason = await app.inject({
      method: 'POST',
      url: `/api/v1/handler/grievances/${draft.id}/escalations`,
      headers: headers(handler),
      payload: { reason: '  ' },
    });
    expect(noReason.statusCode).toBe(400);
    const escalated = await app.inject({
      method: 'POST',
      url: `/api/v1/handler/grievances/${draft.id}/escalations`,
      headers: headers(handler),
      payload: { reason: 'The category reviewer should assess the repeated safety issue.' },
    });
    expect(escalated.statusCode).toBe(201);
    expect(escalated.json().data.escalationLevels).toHaveLength(1);
    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/v1/handler/grievances/${draft.id}/escalations`,
      headers: headers(handler),
      payload: { reason: 'Attempt a duplicate level.' },
    });
    expect(duplicate.statusCode).toBe(409);
    const reviewerQueue = await app.inject({
      method: 'GET',
      url: '/api/v1/reviewer/escalations',
      headers: { cookie: reviewer.cookie },
    });
    expect(reviewerQueue.statusCode).toBe(200);
    expect(
      reviewerQueue.json().data.items.some((item: { id: string }) => item.id === draft.id),
    ).toBe(true);
    const startedReview = await app.inject({
      method: 'POST',
      url: `/api/v1/reviewer/grievances/${draft.id}/escalations/1/start`,
      headers: headers(reviewer),
    });
    expect(startedReview.statusCode).toBe(200);
    const direction = await app.inject({
      method: 'POST',
      url: `/api/v1/reviewer/grievances/${draft.id}/directions`,
      headers: headers(reviewer),
      payload: { body: 'Please verify the maintenance log and provide an update.' },
    });
    expect(direction.statusCode).toBe(200);
    const further = await app.inject({
      method: 'POST',
      url: `/api/v1/reviewer/grievances/${draft.id}/escalations`,
      headers: headers(reviewer),
      payload: { reason: 'The assigned review level requires committee chair review.' },
    });
    expect(further.statusCode).toBe(201);
    expect(further.json().data.escalationLevels[1].state).toBe('AWAITING_MANUAL');
    const assignments = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/escalations/manual-assignment',
      headers: { cookie: admin.cookie },
    });
    const pending = assignments
      .json()
      .data.items.find((item: { id: string }) => item.id === draft.id);
    expect(pending).toBeDefined();
    const assigned = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/escalations/${pending.escalationLevel.id}/reviewer`,
      headers: headers(admin),
      payload: {
        reviewerId: (
          await prisma.user.findUniqueOrThrow({
            where: { email: 'hostel.committee@staff.demo.sgrs.local' },
            select: { id: true },
          })
        ).id,
      },
    });
    expect(assigned.statusCode).toBe(204);
    const messagesForReviewer = await app.inject({
      method: 'GET',
      url: `/api/v1/grievances/${draft.id}`,
      headers: { cookie: reviewer.cookie },
    });
    expect(
      messagesForReviewer
        .json()
        .data.messages.some((message: { body: string }) => message.body.includes('Staff-only')),
    ).toBe(true);
    const managementCase = await app.inject({
      method: 'GET',
      url: `/api/v1/grievances/${draft.id}`,
      headers: { cookie: management.cookie },
    });
    expect(managementCase.statusCode).toBe(403);
    const duplicateEscalation = await prisma.escalation.findMany({
      where: { grievanceId: draft.id, level: 2 },
    });
    expect(duplicateEscalation).toHaveLength(1);
    expect(
      await prisma.notificationOutbox.count({ where: { notification: { grievanceId: draft.id } } }),
    ).toBeGreaterThanOrEqual(4);
  });
});
