import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { requireIsolatedTestDatabase } from '../../../testing/require-isolated-test-database.js';
import { loadEnvironment } from '../../../config/env.js';
import { buildApp } from '../../../app.js';
import { createPrismaClient } from '../../../infrastructure/database/client.js';
import { PrismaAuthRepository } from '../../../infrastructure/repositories/prisma-auth-repository.js';
import { PrismaGrievanceRepository } from '../../../infrastructure/repositories/prisma-grievance-repository.js';
import { PrismaAdministrationRepository } from '../../../infrastructure/repositories/prisma-administration-repository.js';
import { PrismaNotificationRepository } from '../../../infrastructure/repositories/prisma-notification-repository.js';
import { PrismaReportRepository } from '../../../infrastructure/repositories/prisma-report-repository.js';
import { LocalEvidenceStorage } from '../../../infrastructure/storage/local-evidence-storage.js';

const environment = loadEnvironment();
if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required for integration tests.');
requireIsolatedTestDatabase(environment.DATABASE_URL);
if (!environment.DATABASE_URL || !process.env.SGRS_SEED_PASSWORD) {
  throw new Error(
    'DATABASE_URL and SGRS_SEED_PASSWORD are required for Phase 6 integration tests.',
  );
}
const prisma = createPrismaClient(environment.DATABASE_URL);
const demoPassword = process.env.SGRS_SEED_PASSWORD;
let app: FastifyInstance;
let evidenceDirectory = '';
let categoryId = '';

type Identity = { cookie: string; csrf: string };

async function signIn(email: string): Promise<Identity> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { origin: environment.WEB_ORIGIN },
    payload: { email, password: demoPassword },
  });
  expect(response.statusCode).toBe(200);
  const raw = response.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : [raw];
  const session = cookies.find((value) => value?.startsWith('sgrs_session='));
  const csrf = cookies.find((value) => value?.startsWith('sgrs_csrf='));
  if (!session || !csrf) throw new Error('Sign-in did not set both session cookies.');
  const sessionPair = session.split(';', 1)[0];
  const csrfPair = csrf.split(';', 1)[0];
  if (!sessionPair || !csrfPair) throw new Error('Authentication cookie was malformed.');
  return { cookie: `${sessionPair}; ${csrfPair}`, csrf: csrfPair.slice('sgrs_csrf='.length) };
}

function headers(identity: Identity) {
  return {
    origin: environment.WEB_ORIGIN,
    cookie: identity.cookie,
    'x-csrf-token': identity.csrf,
  };
}

function mustFind<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`Expected ${label} in the test database.`);
  return value;
}

async function createReportCase(input: {
  studentId: string;
  categoryId: string;
  title: string;
  status: 'UNDER_REVIEW' | 'RESOLVED';
  submittedAt: Date;
}) {
  return prisma.grievance.create({
    data: {
      caseNumber: `SGRS-TEST-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      submissionKey: `phase6-${crypto.randomUUID()}`,
      studentId: input.studentId,
      categoryId: input.categoryId,
      title: input.title,
      description: 'Synthetic record created by Phase 6 reporting integration tests.',
      incidentDate: input.submittedAt,
      status: input.status,
      submittedAt: input.submittedAt,
      resolutionDeadline: new Date(input.submittedAt.getTime() + 60 * 60 * 1_000),
      slaHoursSnapshot: 1,
      slaPolicyVersion: 1,
    },
  });
}

describe('Phase 6 administration, notifications, reports and audit', () => {
  beforeAll(async () => {
    await prisma.$connect();
    evidenceDirectory = await mkdtemp(join(tmpdir(), 'sgrs-phase6-evidence-'));
    app = await buildApp(environment, {
      authRepository: new PrismaAuthRepository(prisma),
      grievanceRepository: new PrismaGrievanceRepository(prisma),
      evidenceStorage: new LocalEvidenceStorage(evidenceDirectory),
      administrationRepository: new PrismaAdministrationRepository(prisma),
      notificationRepository: new PrismaNotificationRepository(prisma),
      reportRepository: new PrismaReportRepository(prisma),
    });
  });

  afterAll(async () => {
    await app?.close();
    if (evidenceDirectory) await rm(evidenceDirectory, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it('allows administrators to maintain categories, staffing, routing and escalation rules', async () => {
    const admin = await signIn('admin@demo.sgrs.local');
    const student = await signIn('aditi.rao@student.demo.sgrs.local');
    const management = await signIn('management@demo.sgrs.local');
    const categoryName = 'Reporting Test Category';

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/categories',
      headers: headers(admin),
      payload: { name: categoryName, description: 'Integration test category', slaHours: 72 },
    });
    expect(created.statusCode).toBe(201);
    categoryId = created.json().data.id as string;
    expect(created.json().data.policyVersion).toBe(1);

    const forbiddenCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/categories',
      headers: headers(student),
      payload: { name: `Student ${crypto.randomUUID()}`, slaHours: 72 },
    });
    expect(forbiddenCreate.statusCode).toBe(403);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/admin/directory?q=Ramesh',
          headers: { cookie: management.cookie },
        })
      ).statusCode,
    ).toBe(403);

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/categories/${categoryId}`,
      headers: headers(admin),
      payload: { description: 'Updated policy description', slaHours: 96 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.policyVersion).toBe(2);

    const handler = await prisma.user.findUniqueOrThrow({
      where: { email: 'ramesh.kumar@staff.demo.sgrs.local' },
      select: { id: true },
    });
    const reviewer = await prisma.user.findUniqueOrThrow({
      where: { email: 'hostel.committee@staff.demo.sgrs.local' },
      select: { id: true },
    });
    const mappingResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/categories/${categoryId}/handlers`,
      headers: headers(admin),
      payload: { handlerId: handler.id, isPrimary: true },
    });
    expect(mappingResponse.statusCode).toBe(201);
    const mappingId = mappingResponse.json().data.handlers[0].id as string;
    expect(mappingResponse.json().data.handlers[0].isPrimary).toBe(true);

    const rule = await app.inject({
      method: 'PUT',
      url: `/api/v1/admin/categories/${categoryId}/escalation-rules`,
      headers: headers(admin),
      payload: { level: 1, reviewerId: reviewer.id, timelineHours: 24, isActive: true },
    });
    expect(rule.statusCode).toBe(200);
    expect(rule.json().data.escalationRules).toEqual(
      expect.arrayContaining([expect.objectContaining({ level: 1, reviewerId: reviewer.id })]),
    );

    const ended = await app.inject({
      method: 'DELETE',
      url: `/api/v1/admin/categories/${categoryId}/handlers/${mappingId}`,
      headers: headers(admin),
    });
    expect(ended.statusCode).toBe(200);
    const reactivated = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/categories/${categoryId}/handlers`,
      headers: headers(admin),
      payload: { handlerId: handler.id, isPrimary: true },
    });
    expect(reactivated.statusCode).toBe(201);
    const mappingHistory = await prisma.categoryHandler.findMany({
      where: { categoryId, handlerId: handler.id },
      orderBy: { activeFrom: 'asc' },
    });
    expect(mappingHistory).toHaveLength(2);
    expect(mappingHistory.filter((mapping) => mapping.activeTo === null)).toHaveLength(1);

    const directory = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/directory?q=Ramesh',
      headers: { cookie: admin.cookie },
    });
    expect(directory.statusCode).toBe(200);
    expect(directory.json().data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Ramesh Kumar',
          categories: expect.arrayContaining([categoryName]),
        }),
      ]),
    );

    const accountEmail = `phase6.handler.${crypto.randomUUID()}@staff.demo.sgrs.local`;
    const account = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/users',
      headers: headers(admin),
      payload: {
        email: accountEmail,
        name: 'Phase 6 Directory Handler',
        initialPassword: demoPassword,
        role: 'HANDLER',
      },
    });
    expect(account.statusCode).toBe(201);
    const deactivated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/users/${account.json().data.id}`,
      headers: headers(admin),
      payload: { isActive: false },
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json().data.isActive).toBe(false);
    expect(
      await prisma.auditLog.count({
        where: { entityType: 'CATEGORY', entityId: categoryId, action: { startsWith: 'ADMIN_' } },
      }),
    ).toBeGreaterThan(0);
  });

  it('keeps in-app notifications recipient-scoped and protects read state with CSRF', async () => {
    const student = await signIn('aditi.rao@student.demo.sgrs.local');
    const handler = await signIn('ramesh.kumar@staff.demo.sgrs.local');
    const management = await signIn('management@demo.sgrs.local');
    const recipients = await prisma.user.findMany({
      where: {
        email: { in: ['aditi.rao@student.demo.sgrs.local', 'ramesh.kumar@staff.demo.sgrs.local'] },
      },
      select: { id: true, email: true },
    });
    const studentId = mustFind(
      recipients.find((user) => user.email.startsWith('aditi.rao')),
      'seed student',
    ).id;
    const handlerId = mustFind(
      recipients.find((user) => user.email.startsWith('ramesh.kumar')),
      'seed handler',
    ).id;
    const studentNotice = await prisma.notification.create({
      data: {
        recipientId: studentId,
        type: 'STATUS_CHANGE',
        title: 'Student case update',
        body: 'Private to student.',
      },
    });
    const handlerNotice = await prisma.notification.create({
      data: {
        recipientId: handlerId,
        type: 'ASSIGNMENT',
        title: 'Handler assignment update',
        body: 'Private to handler.',
      },
    });

    const studentList = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications?page=1&pageSize=100',
      headers: { cookie: student.cookie },
    });
    expect(studentList.statusCode).toBe(200);
    expect(studentList.json().data.items.map((item: { id: string }) => item.id)).toContain(
      studentNotice.id,
    );
    expect(studentList.json().data.items.map((item: { id: string }) => item.id)).not.toContain(
      handlerNotice.id,
    );

    const handlerList = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications?page=1&pageSize=100',
      headers: { cookie: handler.cookie },
    });
    expect(handlerList.statusCode).toBe(200);
    expect(handlerList.json().data.items.map((item: { id: string }) => item.id)).toContain(
      handlerNotice.id,
    );
    expect(handlerList.json().data.items.map((item: { id: string }) => item.id)).not.toContain(
      studentNotice.id,
    );

    const managementList = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications',
      headers: { cookie: management.cookie },
    });
    expect(managementList.statusCode).toBe(403);

    const missingCsrf = await app.inject({
      method: 'PATCH',
      url: `/api/v1/notifications/${studentNotice.id}/read`,
      headers: { origin: environment.WEB_ORIGIN, cookie: student.cookie },
      payload: {},
    });
    expect(missingCsrf.statusCode).toBe(403);

    const otherRecipient = await app.inject({
      method: 'PATCH',
      url: `/api/v1/notifications/${handlerNotice.id}/read`,
      headers: headers(student),
      payload: {},
    });
    expect(otherRecipient.statusCode).toBe(404);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const markRead = await app.inject({
        method: 'PATCH',
        url: `/api/v1/notifications/${studentNotice.id}/read`,
        headers: headers(student),
        payload: {},
      });
      expect(markRead.statusCode).toBe(204);
    }
    expect(
      await prisma.notification.findUniqueOrThrow({
        where: { id: studentNotice.id },
        select: { readAt: true },
      }),
    ).toMatchObject({ readAt: expect.any(Date) });
  });

  it('keeps management reports aggregate-only and exposes paginated immutable audit only to administrators', async () => {
    const admin = await signIn('admin@demo.sgrs.local');
    const management = await signIn('management@demo.sgrs.local');
    const student = await signIn('aditi.rao@student.demo.sgrs.local');
    const users = await prisma.user.findMany({
      where: {
        email: { in: ['aditi.rao@student.demo.sgrs.local', 'ramesh.kumar@staff.demo.sgrs.local'] },
      },
      select: { id: true, role: true },
    });
    const studentId = mustFind(
      users.find((user) => user.role === 'STUDENT'),
      'student account',
    ).id;
    const handlerId = mustFind(
      users.find((user) => user.role === 'HANDLER'),
      'handler account',
    ).id;
    const category = await prisma.category.findUniqueOrThrow({ where: { id: categoryId } });
    const marker = crypto.randomUUID();
    const reportAt = new Date(
      Date.UTC(2020, 0, 1) + Math.floor(Math.random() * 365 * 24 * 60 * 60 * 1_000),
    );
    const submittedAt = reportAt;
    const activeCase = await createReportCase({
      studentId,
      categoryId: category.id,
      title: 'Reporting test active concern',
      status: 'UNDER_REVIEW',
      submittedAt,
    });
    const resolvedCase = await createReportCase({
      studentId,
      categoryId: category.id,
      title: 'Reporting test resolved concern',
      status: 'RESOLVED',
      submittedAt: reportAt,
    });
    const resolvedAt = new Date(reportAt.getTime() + 2 * 60 * 60 * 1_000);
    await prisma.resolutionCycle.create({
      data: {
        grievanceId: resolvedCase.id,
        cycleNumber: 1,
        resolvedById: handlerId,
        remarks: 'Synthetic first resolution.',
        resolvedAt,
        feedbackDeadline: new Date(Date.now() + 72 * 60 * 60 * 1_000),
      },
    });
    await prisma.assignment.create({
      data: { grievanceId: activeCase.id, handlerId, assignmentType: 'AUTO' },
    });
    const adminAccount = await prisma.user.findUniqueOrThrow({
      where: { email: 'admin@demo.sgrs.local' },
      select: { id: true },
    });
    const audit = await prisma.auditLog.create({
      data: {
        actorId: adminAccount.id,
        entityType: 'GRIEVANCE',
        entityId: activeCase.id,
        grievanceId: activeCase.id,
        action: `PHASE6_AUDIT_${marker}`,
        details: { marker },
        source: 'ADMIN',
      },
    });
    await prisma.auditLog.createMany({
      data: Array.from({ length: 30 }, (_, index) => ({
        actorId: adminAccount.id,
        entityType: 'GRIEVANCE',
        entityId: activeCase.id,
        grievanceId: activeCase.id,
        action: `PHASE6_PAGE_${marker}_${index}`,
        details: { marker, index },
        source: 'ADMIN' as const,
      })),
    });

    const from = reportAt.toISOString();
    const to = new Date(reportAt.getTime() + 1).toISOString();
    const adminOverview = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/reports/overview',
      headers: { cookie: admin.cookie },
    });
    expect(adminOverview.statusCode).toBe(200);
    expect(adminOverview.json().data.totalCases).toBeGreaterThanOrEqual(2);
    expect(adminOverview.json().data.overdueCases).toBeGreaterThanOrEqual(1);
    expect(adminOverview.json().data.byStatus.UNDER_REVIEW).toBeGreaterThanOrEqual(1);

    const managementOverview = await app.inject({
      method: 'GET',
      url: '/api/v1/management/reports/overview',
      headers: { cookie: management.cookie },
    });
    expect(managementOverview.statusCode).toBe(200);
    expect(JSON.stringify(managementOverview.json())).not.toContain(activeCase.id);
    expect(JSON.stringify(managementOverview.json())).not.toContain(activeCase.title);

    const managementCategories = await app.inject({
      method: 'GET',
      url: `/api/v1/management/reports/categories?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      headers: { cookie: management.cookie },
    });
    expect(managementCategories.statusCode).toBe(200);
    expect(managementCategories.json().data.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ categoryId: category.id, total: 2 })]),
    );
    expect(JSON.stringify(managementCategories.json())).not.toContain(activeCase.title);

    const managementHandlers = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/reports/handlers?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      headers: { cookie: management.cookie },
    });
    expect(managementHandlers.statusCode).toBe(403);

    const badPeriod = await app.inject({
      method: 'GET',
      url: `/api/v1/management/reports/categories?from=${encodeURIComponent(to)}&to=${encodeURIComponent(from)}`,
      headers: { cookie: management.cookie },
    });
    expect(badPeriod.statusCode).toBe(400);

    const handlerReport = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/reports/handlers?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      headers: { cookie: admin.cookie },
    });
    expect(handlerReport.statusCode).toBe(200);
    expect(handlerReport.json().data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          handlerId,
          activeAssignments: expect.any(Number),
          resolvedCount: 1,
          averageHoursToFirstResolution: 2,
        }),
      ]),
    );

    const auditPageOne = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/grievances/${activeCase.id}/audit?page=1&pageSize=10`,
      headers: { cookie: admin.cookie },
    });
    expect(auditPageOne.statusCode).toBe(200);
    expect(auditPageOne.json().data).toMatchObject({ page: 1, pageSize: 10, total: 31 });
    const auditPageTwo = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/grievances/${activeCase.id}/audit?page=2&pageSize=10`,
      headers: { cookie: admin.cookie },
    });
    expect(auditPageTwo.json().data.items).toHaveLength(10);
    expect(auditPageOne.json().data.items[0].id).not.toBe(auditPageTwo.json().data.items[0].id);

    const managementAudit = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/grievances/${activeCase.id}/audit`,
      headers: { cookie: management.cookie },
    });
    expect(managementAudit.statusCode).toBe(403);
    const studentAudit = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/grievances/${activeCase.id}/audit`,
      headers: { cookie: student.cookie },
    });
    expect(studentAudit.statusCode).toBe(403);

    await expect(
      prisma.auditLog.update({ where: { id: audit.id }, data: { action: 'TAMPERED' } }),
    ).rejects.toThrow();
    expect(
      await prisma.auditLog.findUniqueOrThrow({
        where: { id: audit.id },
        select: { action: true },
      }),
    ).toEqual({ action: `PHASE6_AUDIT_${marker}` });
  });
});
