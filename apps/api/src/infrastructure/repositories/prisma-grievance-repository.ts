import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import type {
  GrievanceCategoryOption,
  CaseMessageItem,
  GrievanceDetail,
  EscalationLevelItem,
  GrievanceEvidence,
  GrievanceListResponse,
  GrievanceSummary,
  ReviewerQueueResponse,
  HandlerWorkloadResponse,
  ManualReviewerAssignmentResponse,
} from '@sgrs/contracts';
import { AppError } from '../errors/app-error.js';
import type {
  EvidenceMetadataInput,
  GrievanceActor,
  GrievanceListInput,
  GrievanceRepository,
  SubmissionContext,
  SubmissionPlan,
  CaseMessageInput,
  ReviewerOption,
} from '../../modules/grievances/application/ports.js';
import type { GrievancePatch } from '../../modules/grievances/domain/validation.js';

const detailInclude = {
  category: { select: { name: true } },
  assignments: {
    where: { endedAt: null },
    orderBy: { assignedAt: 'desc' },
    take: 1,
    include: { handler: { select: { name: true } } },
  },
  evidence: {
    where: { deletedAt: null },
    orderBy: { uploadedAt: 'asc' },
    select: { id: true, originalName: true, mediaType: true, sizeBytes: true, uploadedAt: true },
  },
  statusHistory: {
    orderBy: { occurredAt: 'asc' },
    select: { id: true, previousStatus: true, newStatus: true, occurredAt: true, publicNote: true },
  },
  messages: {
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, name: true, role: true } } },
  },
  escalations: {
    orderBy: { level: 'asc' },
    include: { reviewer: { select: { id: true, name: true } } },
  },
} satisfies Prisma.GrievanceInclude;

type DetailRecord = Prisma.GrievanceGetPayload<{ include: typeof detailInclude }>;

function iso(date: Date | null): string | null {
  return date?.toISOString() ?? null;
}

function calendarDate(date: Date | null): string | null {
  return date?.toISOString().slice(0, 10) ?? null;
}

function mapSummary(record: DetailRecord): GrievanceSummary {
  return {
    id: record.id,
    caseNumber: record.caseNumber,
    title: record.title,
    categoryId: record.categoryId,
    categoryName: record.category?.name ?? null,
    incidentDate: calendarDate(record.incidentDate),
    status: record.status,
    priority: record.priority,
    submittedAt: iso(record.submittedAt),
    resolutionDeadline: iso(record.resolutionDeadline),
    assignedHandlerName: record.assignments[0]?.handler.name ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  };
}

function mapDetail(record: DetailRecord, actor: GrievanceActor): GrievanceDetail {
  return {
    ...mapSummary(record),
    description: record.description,
    location: record.location,
    slaHoursSnapshot: record.slaHoursSnapshot,
    slaPolicyVersion: record.slaPolicyVersion,
    evidence: record.evidence.map((item) => ({
      id: item.id,
      originalName: item.originalName,
      mediaType: item.mediaType,
      sizeBytes: Number(item.sizeBytes),
      uploadedAt: item.uploadedAt.toISOString(),
    })),
    statusHistory: record.statusHistory.map((event) => ({
      id: event.id,
      previousStatus: event.previousStatus,
      newStatus: event.newStatus,
      occurredAt: event.occurredAt.toISOString(),
      publicNote: event.publicNote,
    })),
    messages: record.messages
      .filter((message) => actor.role !== 'STUDENT' || message.audience !== 'STAFF_ONLY')
      .map((message): CaseMessageItem => ({
        id: message.id,
        authorId: message.author.id,
        authorName: message.author.name,
        authorRole: message.author.role,
        messageType: message.messageType,
        audience: message.audience,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
        inReplyToId: message.inReplyToId,
      })),
    escalationLevels:
      actor.role === 'STUDENT'
        ? []
        : record.escalations.map((escalation): EscalationLevelItem => ({
            id: escalation.id,
            level: escalation.level,
            reasonType: escalation.reasonType,
            reason: escalation.reason,
            state: escalation.state,
            reviewerId: escalation.reviewerId,
            reviewerName: escalation.reviewer?.name ?? null,
            createdAt: escalation.createdAt.toISOString(),
            reviewerAssignedAt: iso(escalation.reviewerAssignedAt),
          })),
  };
}

function auditData(input: {
  actorId: string | null;
  grievanceId: string;
  action: string;
  requestId: string;
  details?: Prisma.InputJsonObject;
}) {
  return {
    actorId: input.actorId,
    entityType: 'GRIEVANCE',
    entityId: input.grievanceId,
    grievanceId: input.grievanceId,
    action: input.action,
    requestId: input.requestId,
    source: 'API' as const,
    details: input.details ?? {},
  };
}

function visibleWhere(actor: GrievanceActor): Prisma.GrievanceWhereInput {
  if (actor.role === 'STUDENT') return { studentId: actor.userId };
  if (actor.role === 'HANDLER') {
    return { assignments: { some: { handlerId: actor.userId, endedAt: null } } };
  }
  if (actor.role === 'REVIEWER') {
    return { escalations: { some: { reviewerId: actor.userId } } };
  }
  if (actor.role === 'ADMINISTRATOR') return {};
  return { id: '00000000-0000-0000-0000-000000000000' };
}

function missing(): never {
  throw new AppError(404, 'GRIEVANCE_NOT_FOUND', 'Grievance was not found.');
}

export class PrismaGrievanceRepository implements GrievanceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listCategories(): Promise<GrievanceCategoryOption[]> {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, description: true },
    });
    return categories;
  }

  async createDraft(actor: GrievanceActor, requestId: string): Promise<GrievanceDetail> {
    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.grievance.create({
        data: { studentId: actor.userId, status: 'DRAFT' },
      });
      await tx.statusHistory.create({
        data: {
          grievanceId: created.id,
          newStatus: 'DRAFT',
          actorId: actor.userId,
          actorRoleSnapshot: 'STUDENT',
          requestId,
        },
      });
      await tx.auditLog.create({
        data: auditData({
          actorId: actor.userId,
          grievanceId: created.id,
          action: 'GRIEVANCE_DRAFT_CREATED',
          requestId,
        }),
      });
      return tx.grievance.findUniqueOrThrow({ where: { id: created.id }, include: detailInclude });
    });
    return mapDetail(record, actor);
  }

  async list(input: GrievanceListInput): Promise<GrievanceListResponse['data']> {
    const query = input.query?.trim();
    const where: Prisma.GrievanceWhereInput = {
      ...visibleWhere(input.actor),
      ...(input.status ? { status: input.status } : {}),
      ...(query
        ? {
            OR: [
              { caseNumber: { contains: query, mode: 'insensitive' } },
              { title: { contains: query, mode: 'insensitive' } },
              { category: { name: { contains: query, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const orderBy: Prisma.GrievanceOrderByWithRelationInput[] =
      input.sort === 'deadline'
        ? [{ resolutionDeadline: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
        : input.sort === 'status'
          ? [{ status: 'asc' }, { updatedAt: 'desc' }]
          : [{ updatedAt: 'desc' }, { id: 'desc' }];
    const [records, total] = await this.prisma.$transaction([
      this.prisma.grievance.findMany({
        where,
        include: detailInclude,
        orderBy,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.grievance.count({ where }),
    ]);
    return {
      items: records.map(mapSummary),
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  }

  async reviewerQueue(
    actor: GrievanceActor,
    input: { page: number; pageSize: number; query?: string },
  ): Promise<ReviewerQueueResponse['data']> {
    const query = input.query?.trim();
    const where: Prisma.EscalationWhereInput = {
      reviewerId: actor.userId,
      state: { in: ['REVIEWER_ASSIGNED', 'UNDER_REVIEWER_HANDLING'] },
      ...(query
        ? {
            grievance: {
              OR: [
                { caseNumber: { contains: query, mode: 'insensitive' } },
                { title: { contains: query, mode: 'insensitive' } },
                { category: { name: { contains: query, mode: 'insensitive' } } },
              ],
            },
          }
        : {}),
    };
    const [levels, total] = await this.prisma.$transaction([
      this.prisma.escalation.findMany({
        where,
        include: {
          grievance: { include: detailInclude },
          reviewer: { select: { id: true, name: true } },
        },
        orderBy: [{ createdAt: 'asc' }, { level: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.escalation.count({ where }),
    ]);
    return {
      items: levels.map((level) => ({
        ...mapSummary(level.grievance),
        escalationLevel: {
          id: level.id,
          level: level.level,
          reasonType: level.reasonType,
          reason: level.reason,
          state: level.state,
          reviewerId: level.reviewerId,
          reviewerName: level.reviewer?.name ?? null,
          createdAt: level.createdAt.toISOString(),
          reviewerAssignedAt: iso(level.reviewerAssignedAt),
        },
      })),
      page: input.page,
      pageSize: input.pageSize,
      total,
    };
  }

  async handlerWorkload(actor: GrievanceActor): Promise<HandlerWorkloadResponse['data']> {
    const now = new Date();
    const where: Prisma.AssignmentWhereInput = {
      handlerId: actor.userId,
      endedAt: null,
      grievance: { status: { notIn: ['RESOLVED', 'CLOSED', 'WITHDRAWN'] } },
    };
    const overdueWhere: Prisma.AssignmentWhereInput = {
      handlerId: actor.userId,
      endedAt: null,
      grievance: {
        status: { notIn: ['RESOLVED', 'CLOSED', 'WITHDRAWN'] },
        resolutionDeadline: { lt: now },
      },
    };
    const [assigned, overdue, groups] = await this.prisma.$transaction([
      this.prisma.assignment.count({ where }),
      this.prisma.assignment.count({ where: overdueWhere }),
      this.prisma.grievance.groupBy({
        by: ['status'],
        where: { assignments: { some: { handlerId: actor.userId, endedAt: null } } },
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
    ]);
    return {
      assigned,
      overdue,
      byStatus: Object.fromEntries(
        groups.map((group) => [
          group.status,
          typeof group._count === 'object' ? (group._count._all ?? 0) : 0,
        ]),
      ),
    };
  }

  async activeReviewers(_actor: GrievanceActor): Promise<ReviewerOption[]> {
    void _actor;
    return this.prisma.user.findMany({
      where: { role: 'REVIEWER', isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true },
    });
  }

  async manualReviewerAssignments(
    _actor: GrievanceActor,
  ): Promise<ManualReviewerAssignmentResponse['data']['items']> {
    void _actor;
    const levels = await this.prisma.escalation.findMany({
      where: { state: 'AWAITING_MANUAL' },
      include: {
        grievance: { include: detailInclude },
        reviewer: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { level: 'asc' }],
    });
    return levels.map((level) => ({
      ...mapSummary(level.grievance),
      escalationLevel: {
        id: level.id,
        level: level.level,
        reasonType: level.reasonType,
        reason: level.reason,
        state: level.state,
        reviewerId: level.reviewerId,
        reviewerName: level.reviewer?.name ?? null,
        createdAt: level.createdAt.toISOString(),
        reviewerAssignedAt: iso(level.reviewerAssignedAt),
      },
    }));
  }

  async get(actor: GrievanceActor, grievanceId: string): Promise<GrievanceDetail> {
    const record = await this.prisma.grievance.findFirst({
      where: { id: grievanceId, ...visibleWhere(actor) },
      include: detailInclude,
    });
    if (!record) missing();
    return mapDetail(record, actor);
  }

  async getSubmissionContext(
    actor: GrievanceActor,
    grievanceId: string,
  ): Promise<SubmissionContext> {
    const record = await this.prisma.grievance.findFirst({
      where: { id: grievanceId, studentId: actor.userId },
      include: {
        category: {
          include: {
            handlerMappings: {
              where: { isPrimary: true },
              include: {
                handler: { select: { id: true, name: true, role: true, isActive: true } },
              },
            },
          },
        },
      },
    });
    if (!record) missing();
    return {
      grievanceId: record.id,
      studentId: record.studentId,
      status: record.status,
      version: record.version,
      fields: {
        title: record.title,
        description: record.description,
        categoryId: record.categoryId,
        incidentDate: calendarDate(record.incidentDate),
        location: record.location,
        priority: record.priority,
      },
      category: record.category
        ? {
            id: record.category.id,
            name: record.category.name,
            isActive: record.category.isActive,
            slaHours: record.category.slaHours,
            policyVersion: record.category.policyVersion,
            primaryHandlers: record.category.handlerMappings.map((mapping) => ({
              handlerId: mapping.handler.id,
              name: mapping.handler.name,
              role: mapping.handler.role,
              isActive: mapping.handler.isActive,
              activeFrom: mapping.activeFrom,
              activeTo: mapping.activeTo,
            })),
          }
        : null,
    };
  }

  async findSubmittedByKey(
    actor: GrievanceActor,
    submissionKey: string,
  ): Promise<GrievanceDetail | null> {
    const record = await this.prisma.grievance.findFirst({
      where: { studentId: actor.userId, submissionKey },
      include: detailInclude,
    });
    return record ? mapDetail(record, actor) : null;
  }

  async update(
    actor: GrievanceActor,
    input: {
      grievanceId: string;
      expectedVersion: number;
      patch: GrievancePatch;
      requestId: string;
    },
  ): Promise<GrievanceDetail> {
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM grievances WHERE id = ${input.grievanceId}::uuid FOR UPDATE`;
      const current = await tx.grievance.findFirst({
        where: { id: input.grievanceId, studentId: actor.userId },
      });
      if (!current) missing();
      if (current.version !== input.expectedVersion) {
        throw new AppError(
          409,
          'VERSION_CONFLICT',
          'This draft changed elsewhere. Reload and try again.',
        );
      }
      const activeAssignment = await tx.assignment.findFirst({
        where: { grievanceId: current.id, endedAt: null },
        select: { id: true },
      });
      const isEditableState =
        current.status === 'DRAFT' || current.status === 'PENDING_MANUAL_ASSIGNMENT';
      if (!isEditableState || activeAssignment) {
        throw new AppError(409, 'GRIEVANCE_LOCKED', 'This grievance can no longer be edited.');
      }
      if (
        current.status === 'PENDING_MANUAL_ASSIGNMENT' &&
        input.patch.categoryId !== undefined &&
        input.patch.categoryId !== current.categoryId
      ) {
        throw new AppError(409, 'CATEGORY_LOCKED', 'Category cannot be changed after submission.');
      }

      const updateData: Prisma.GrievanceUpdateInput = {};
      if (input.patch.title !== undefined) updateData.title = input.patch.title;
      if (input.patch.description !== undefined) updateData.description = input.patch.description;
      if (input.patch.categoryId !== undefined) {
        updateData.category = input.patch.categoryId
          ? { connect: { id: input.patch.categoryId } }
          : { disconnect: true };
      }
      if (input.patch.incidentDate !== undefined) {
        updateData.incidentDate = input.patch.incidentDate
          ? new Date(`${input.patch.incidentDate}T00:00:00.000Z`)
          : null;
      }
      if (input.patch.location !== undefined) updateData.location = input.patch.location;
      if (input.patch.priority !== undefined) updateData.priority = input.patch.priority;

      const updated = await tx.grievance.update({
        where: { id: current.id },
        data: { ...updateData, version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: auditData({
          actorId: actor.userId,
          grievanceId: current.id,
          action: current.status === 'DRAFT' ? 'GRIEVANCE_DRAFT_UPDATED' : 'GRIEVANCE_UPDATED',
          requestId: input.requestId,
          details: { changedFields: Object.keys(input.patch), version: updated.version },
        }),
      });
      return tx.grievance.findUniqueOrThrow({ where: { id: current.id }, include: detailInclude });
    });
    return mapDetail(record, actor);
  }

  async submit(
    actor: GrievanceActor,
    input: {
      grievanceId: string;
      expectedVersion: number;
      submissionKey: string;
      plan: SubmissionPlan;
      requestId: string;
    },
  ): Promise<GrievanceDetail> {
    let record: DetailRecord;
    try {
      record = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM grievances WHERE id = ${input.grievanceId}::uuid FOR UPDATE`;
        const repeated = await tx.grievance.findUnique({
          where: { submissionKey: input.submissionKey },
          include: detailInclude,
        });
        if (repeated) {
          if (repeated.studentId !== actor.userId || repeated.id !== input.grievanceId) {
            throw new AppError(
              409,
              'IDEMPOTENCY_KEY_REUSED',
              'This submission key was already used for another grievance.',
            );
          }
          return repeated;
        }
        const current = await tx.grievance.findFirst({
          where: { id: input.grievanceId, studentId: actor.userId },
        });
        if (!current) missing();
        if (current.status !== 'DRAFT') {
          throw new AppError(409, 'INVALID_STATE', 'Only a saved draft can be submitted.');
        }
        if (current.version !== input.expectedVersion) {
          throw new AppError(
            409,
            'VERSION_CONFLICT',
            'This draft changed elsewhere. Reload and try again.',
          );
        }
        if (!current.categoryId) {
          throw new AppError(400, 'VALIDATION_FAILED', 'Select an active grievance category.', {
            fields: [{ field: 'categoryId', message: 'Select an active grievance category.' }],
          });
        }
        const category = await tx.category.findUnique({
          where: { id: current.categoryId },
          include: {
            handlerMappings: {
              where: { isPrimary: true },
              include: { handler: { select: { id: true, role: true, isActive: true } } },
            },
          },
        });
        if (
          !category?.isActive ||
          category.slaHours !== input.plan.slaHours ||
          category.policyVersion !== input.plan.policyVersion
        ) {
          throw new AppError(
            409,
            'CATEGORY_CONFIGURATION_CHANGED',
            'Category routing or SLA changed. Review and submit again.',
          );
        }
        const primary = category.handlerMappings.find(
          (mapping) =>
            mapping.handler.role === 'HANDLER' &&
            mapping.handler.isActive &&
            mapping.activeFrom <= input.plan.at &&
            (mapping.activeTo === null || mapping.activeTo > input.plan.at),
        );
        if ((primary?.handlerId ?? null) !== input.plan.handlerId) {
          throw new AppError(
            409,
            'CATEGORY_CONFIGURATION_CHANGED',
            'Category routing changed. Review and submit again.',
          );
        }

        const referenceRows = await tx.$queryRaw<Array<{ reference: bigint }>>`
        SELECT nextval('grievance_case_reference_seq') AS reference
      `;
        const caseNumber = `SGRS-${referenceRows[0]?.reference.toString() ?? ''}`;
        const finalStatus = primary ? 'ASSIGNED' : 'PENDING_MANUAL_ASSIGNMENT';
        const updated = await tx.grievance.update({
          where: { id: current.id },
          data: {
            caseNumber,
            submissionKey: input.submissionKey,
            submittedAt: input.plan.at,
            resolutionDeadline: input.plan.resolutionDeadline,
            slaHoursSnapshot: input.plan.slaHours,
            slaPolicyVersion: input.plan.policyVersion,
            status: finalStatus,
            version: { increment: 1 },
          },
        });
        await tx.statusHistory.create({
          data: {
            grievanceId: current.id,
            previousStatus: 'DRAFT',
            newStatus: 'SUBMITTED',
            actorId: actor.userId,
            actorRoleSnapshot: 'STUDENT',
            occurredAt: input.plan.at,
            requestId: input.requestId,
          },
        });
        await tx.statusHistory.create({
          data: {
            grievanceId: current.id,
            previousStatus: 'SUBMITTED',
            newStatus: finalStatus,
            occurredAt: input.plan.at,
            reason: primary
              ? 'Automatic category routing.'
              : 'No eligible primary handler configured.',
            requestId: input.requestId,
          },
        });

        if (primary) {
          await tx.assignment.create({
            data: {
              grievanceId: current.id,
              handlerId: primary.handlerId,
              assignmentType: 'AUTO',
              reason: 'Configured primary category handler.',
              assignedAt: input.plan.at,
            },
          });
        }
        await this.createNotification(tx, {
          recipientId: actor.userId,
          grievanceId: current.id,
          type: 'SUBMISSION',
          title: 'Grievance submitted',
          body: `Your grievance ${caseNumber} has been submitted.`,
          idempotencyKey: `m3:submission:${current.id}:student`,
        });
        if (primary) {
          await this.createNotification(tx, {
            recipientId: primary.handlerId,
            grievanceId: current.id,
            type: 'ASSIGNMENT',
            title: 'Grievance assigned to you',
            body: `Grievance ${caseNumber} was routed to your category.`,
            idempotencyKey: `m3:submission:${current.id}:handler:${primary.handlerId}`,
          });
        } else {
          const admins = await tx.user.findMany({
            where: { role: 'ADMINISTRATOR', isActive: true },
            select: { id: true },
          });
          for (const admin of admins) {
            await this.createNotification(tx, {
              recipientId: admin.id,
              grievanceId: current.id,
              type: 'MANUAL_ASSIGNMENT_REQUIRED',
              title: 'Manual grievance assignment required',
              body: `Grievance ${caseNumber} has no eligible category handler.`,
              idempotencyKey: `m3:submission:${current.id}:manual:${admin.id}`,
            });
          }
        }
        await tx.auditLog.create({
          data: auditData({
            actorId: actor.userId,
            grievanceId: current.id,
            action: 'GRIEVANCE_SUBMITTED',
            requestId: input.requestId,
            details: {
              caseNumber,
              categoryId: category.id,
              status: finalStatus,
              resolutionDeadline: input.plan.resolutionDeadline.toISOString(),
              slaHoursSnapshot: input.plan.slaHours,
              slaPolicyVersion: input.plan.policyVersion,
              handlerId: primary?.handlerId ?? null,
            },
          }),
        });
        return tx.grievance.findUniqueOrThrow({
          where: { id: updated.id },
          include: detailInclude,
        });
      });
    } catch (error) {
      const repeated = await this.prisma.grievance.findUnique({
        where: { submissionKey: input.submissionKey },
        include: detailInclude,
      });
      if (!repeated) throw error;
      if (repeated.studentId !== actor.userId || repeated.id !== input.grievanceId) {
        throw new AppError(
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'This submission key was already used for another grievance.',
        );
      }
      record = repeated;
    }
    return mapDetail(record, actor);
  }

  async withdraw(
    actor: GrievanceActor,
    grievanceId: string,
    requestId: string,
  ): Promise<GrievanceDetail> {
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM grievances WHERE id = ${grievanceId}::uuid FOR UPDATE`;
      const current = await tx.grievance.findFirst({
        where: { id: grievanceId, studentId: actor.userId },
      });
      if (!current) missing();
      if (['RESOLVED', 'CLOSED', 'WITHDRAWN'].includes(current.status)) {
        throw new AppError(409, 'INVALID_STATE', 'This grievance can no longer be withdrawn.');
      }
      const activeAssignment = await tx.assignment.findFirst({
        where: { grievanceId, endedAt: null },
        select: { id: true },
      });
      const updated = await tx.grievance.update({
        where: { id: grievanceId },
        data: { status: 'WITHDRAWN', version: { increment: 1 } },
      });
      if (activeAssignment) {
        await tx.assignment.update({
          where: { id: activeAssignment.id },
          data: { endedAt: new Date(), endReason: 'Student withdrew the grievance.' },
        });
      }
      await tx.statusHistory.create({
        data: {
          grievanceId,
          previousStatus: current.status,
          newStatus: 'WITHDRAWN',
          actorId: actor.userId,
          actorRoleSnapshot: 'STUDENT',
          requestId,
        },
      });
      await tx.auditLog.create({
        data: auditData({
          actorId: actor.userId,
          grievanceId,
          action: 'GRIEVANCE_WITHDRAWN',
          requestId,
        }),
      });
      await this.createNotification(tx, {
        recipientId: actor.userId,
        grievanceId,
        type: 'STATUS_CHANGE',
        title: 'Grievance withdrawn',
        body: `Grievance ${current.caseNumber ?? ''} was withdrawn.`,
        idempotencyKey: `m3:withdraw:${grievanceId}`,
      });
      return tx.grievance.findUniqueOrThrow({ where: { id: updated.id }, include: detailInclude });
    });
    return mapDetail(record, actor);
  }

  async setHandlerUnderReview(
    actor: GrievanceActor,
    grievanceId: string,
    requestId: string,
  ): Promise<GrievanceDetail> {
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM grievances WHERE id = ${grievanceId}::uuid FOR UPDATE`;
      const current = await tx.grievance.findFirst({
        where: { id: grievanceId, ...visibleWhere(actor) },
      });
      if (!current) missing();
      if (current.status !== 'ASSIGNED') {
        throw new AppError(409, 'INVALID_STATE', 'Only an assigned case can enter investigation.');
      }
      const at = new Date();
      await tx.grievance.update({
        where: { id: grievanceId },
        data: { status: 'UNDER_REVIEW', version: { increment: 1 } },
      });
      await tx.statusHistory.create({
        data: {
          grievanceId,
          previousStatus: 'ASSIGNED',
          newStatus: 'UNDER_REVIEW',
          actorId: actor.userId,
          actorRoleSnapshot: 'HANDLER',
          publicNote: 'Investigation started.',
          occurredAt: at,
          requestId,
        },
      });
      await tx.auditLog.create({
        data: auditData({
          actorId: actor.userId,
          grievanceId,
          action: 'GRIEVANCE_REVIEW_STARTED',
          requestId,
        }),
      });
      const currentAssignment = await tx.assignment.findFirst({
        where: { grievanceId, handlerId: actor.userId, endedAt: null },
      });
      if (!currentAssignment) missing();
      await this.createNotification(tx, {
        recipientId: current.studentId,
        grievanceId,
        type: 'STATUS_CHANGE',
        title: 'Investigation started',
        body: `The handler has started reviewing ${current.caseNumber ?? 'your grievance'}.`,
        idempotencyKey: `m4:review-start:${grievanceId}`,
      });
      return tx.grievance.findUniqueOrThrow({ where: { id: grievanceId }, include: detailInclude });
    });
    return mapDetail(record, actor);
  }

  async addHandlerMessage(
    actor: GrievanceActor,
    grievanceId: string,
    input: CaseMessageInput,
    requestId: string,
  ): Promise<GrievanceDetail> {
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM grievances WHERE id = ${grievanceId}::uuid FOR UPDATE`;
      const current = await tx.grievance.findFirst({
        where: { id: grievanceId, ...visibleWhere(actor) },
      });
      if (!current) missing();
      if (current.status !== 'UNDER_REVIEW') {
        throw new AppError(
          409,
          'INVALID_STATE',
          'Investigation notes and information requests require an under-review case.',
        );
      }
      const message = await tx.caseMessage.create({
        data: {
          grievanceId,
          authorId: actor.userId,
          messageType: input.messageType,
          audience: input.messageType === 'INTERNAL_NOTE' ? 'STAFF_ONLY' : 'STUDENT_AND_STAFF',
          body: input.body,
          ...(input.inReplyToId ? { inReplyToId: input.inReplyToId } : {}),
        },
      });
      if (input.messageType === 'INFO_REQUEST') {
        await tx.grievance.update({
          where: { id: grievanceId },
          data: { status: 'AWAITING_INFORMATION', version: { increment: 1 } },
        });
        await tx.statusHistory.create({
          data: {
            grievanceId,
            previousStatus: 'UNDER_REVIEW',
            newStatus: 'AWAITING_INFORMATION',
            actorId: actor.userId,
            actorRoleSnapshot: 'HANDLER',
            publicNote: 'Additional information requested from the student.',
            requestId,
          },
        });
        await this.createNotification(tx, {
          recipientId: current.studentId,
          grievanceId,
          type: 'INFORMATION_REQUEST',
          title: 'Additional information requested',
          body: `The handler requested information for ${current.caseNumber ?? 'your grievance'}.`,
          idempotencyKey: `m4:info-request:${message.id}`,
        });
      }
      await tx.auditLog.create({
        data: auditData({
          actorId: actor.userId,
          grievanceId,
          action:
            input.messageType === 'INFO_REQUEST' ? 'INFORMATION_REQUESTED' : 'INTERNAL_NOTE_ADDED',
          requestId,
          details: { messageId: message.id, messageType: input.messageType },
        }),
      });
      return tx.grievance.findUniqueOrThrow({ where: { id: grievanceId }, include: detailInclude });
    });
    return mapDetail(record, actor);
  }

  async respondToInformationRequest(
    actor: GrievanceActor,
    grievanceId: string,
    requestIdId: string,
    body: string,
    requestId: string,
  ): Promise<GrievanceDetail> {
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM grievances WHERE id = ${grievanceId}::uuid FOR UPDATE`;
      const current = await tx.grievance.findFirst({
        where: { id: grievanceId, studentId: actor.userId },
      });
      if (!current) missing();
      if (current.status !== 'AWAITING_INFORMATION') {
        throw new AppError(
          409,
          'INVALID_STATE',
          'This grievance is not waiting for student information.',
        );
      }
      const informationRequest = await tx.caseMessage.findFirst({
        where: {
          grievanceId,
          messageType: 'INFO_REQUEST',
          audience: 'STUDENT_AND_STAFF',
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      if (!informationRequest || informationRequest.id !== requestIdId) {
        throw new AppError(
          409,
          'INFORMATION_REQUEST_NOT_CURRENT',
          'Respond to the most recent information request.',
        );
      }
      const response = await tx.caseMessage.create({
        data: {
          grievanceId,
          authorId: actor.userId,
          messageType: 'STUDENT_RESPONSE',
          audience: 'STUDENT_AND_STAFF',
          body,
          inReplyToId: requestIdId,
        },
      });
      await tx.grievance.update({
        where: { id: grievanceId },
        data: { status: 'UNDER_REVIEW', version: { increment: 1 } },
      });
      await tx.statusHistory.create({
        data: {
          grievanceId,
          previousStatus: 'AWAITING_INFORMATION',
          newStatus: 'UNDER_REVIEW',
          actorId: actor.userId,
          actorRoleSnapshot: 'STUDENT',
          publicNote: 'Student provided the requested information.',
          requestId,
        },
      });
      const assignment = await tx.assignment.findFirst({
        where: { grievanceId, endedAt: null },
        select: { handlerId: true },
      });
      if (assignment) {
        await this.createNotification(tx, {
          recipientId: assignment.handlerId,
          grievanceId,
          type: 'INFORMATION_REQUEST',
          title: 'Student responded to an information request',
          body: `A student response was added to ${current.caseNumber ?? 'an assigned grievance'}.`,
          idempotencyKey: `m4:student-response:${response.id}`,
        });
      }
      await tx.auditLog.create({
        data: auditData({
          actorId: actor.userId,
          grievanceId,
          action: 'INFORMATION_RESPONSE_ADDED',
          requestId,
          details: { messageId: response.id, requestMessageId: informationRequest.id },
        }),
      });
      return tx.grievance.findUniqueOrThrow({ where: { id: grievanceId }, include: detailInclude });
    });
    return mapDetail(record, actor);
  }

  async addReviewerDirection(
    actor: GrievanceActor,
    grievanceId: string,
    body: string,
    requestId: string,
  ): Promise<GrievanceDetail> {
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM grievances WHERE id = ${grievanceId}::uuid FOR UPDATE`;
      const current = await tx.grievance.findFirst({
        where: { id: grievanceId, ...visibleWhere(actor) },
      });
      if (!current) missing();
      if (current.status !== 'ESCALATED')
        throw new AppError(
          409,
          'INVALID_STATE',
          'Reviewer directions require an escalated grievance.',
        );
      const assignedLevel = await tx.escalation.findFirst({
        where: { grievanceId, reviewerId: actor.userId, state: 'UNDER_REVIEWER_HANDLING' },
        orderBy: { level: 'desc' },
        select: { id: true },
      });
      if (!assignedLevel) missing();
      const message = await tx.caseMessage.create({
        data: {
          grievanceId,
          authorId: actor.userId,
          messageType: 'INTERNAL_NOTE',
          audience: 'STAFF_ONLY',
          body,
        },
      });
      await tx.auditLog.create({
        data: auditData({
          actorId: actor.userId,
          grievanceId,
          action: 'REVIEWER_DIRECTION_ADDED',
          requestId,
          details: { messageId: message.id, escalationId: assignedLevel.id },
        }),
      });
      return tx.grievance.findUniqueOrThrow({ where: { id: grievanceId }, include: detailInclude });
    });
    return mapDetail(record, actor);
  }

  async startReviewerHandling(
    actor: GrievanceActor,
    grievanceId: string,
    level: number,
    requestId: string,
  ): Promise<GrievanceDetail> {
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM grievances WHERE id = ${grievanceId}::uuid FOR UPDATE`;
      const current = await tx.grievance.findFirst({
        where: { id: grievanceId, ...visibleWhere(actor) },
      });
      if (!current) missing();
      const escalation = await tx.escalation.findFirst({
        where: { grievanceId, level, reviewerId: actor.userId },
      });
      if (!escalation) missing();
      if (current.status !== 'ESCALATED' || escalation.state !== 'REVIEWER_ASSIGNED') {
        throw new AppError(
          409,
          'INVALID_STATE',
          'This escalation level is not available to begin review.',
        );
      }
      await tx.escalation.update({
        where: { id: escalation.id },
        data: { state: 'UNDER_REVIEWER_HANDLING' },
      });
      await tx.auditLog.create({
        data: auditData({
          actorId: actor.userId,
          grievanceId,
          action: 'REVIEWER_HANDLING_STARTED',
          requestId,
          details: { escalationId: escalation.id, level },
        }),
      });
      return tx.grievance.findUniqueOrThrow({ where: { id: grievanceId }, include: detailInclude });
    });
    return mapDetail(record, actor);
  }

  async assignReviewer(
    actor: GrievanceActor,
    escalationId: string,
    reviewerId: string,
    requestId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const initial = await tx.escalation.findUnique({
        where: { id: escalationId },
        select: { grievanceId: true },
      });
      if (!initial) missing();
      await tx.$queryRaw`SELECT id FROM grievances WHERE id = ${initial.grievanceId}::uuid FOR UPDATE`;
      const escalation = await tx.escalation.findUnique({ where: { id: escalationId } });
      if (!escalation) missing();
      if (escalation.state !== 'AWAITING_MANUAL')
        throw new AppError(
          409,
          'INVALID_STATE',
          'Only an escalation waiting for manual assignment can be assigned.',
        );
      const reviewer = await tx.user.findFirst({
        where: { id: reviewerId, role: 'REVIEWER', isActive: true },
        select: { id: true, name: true },
      });
      if (!reviewer)
        throw new AppError(400, 'INVALID_REVIEWER', 'Select an active reviewer account.');
      const updated = await tx.escalation.update({
        where: { id: escalation.id },
        data: { reviewerId, reviewerAssignedAt: new Date(), state: 'REVIEWER_ASSIGNED' },
      });
      const grievance = await tx.grievance.findUniqueOrThrow({
        where: { id: escalation.grievanceId },
        select: { caseNumber: true },
      });
      await this.createNotification(tx, {
        recipientId: reviewer.id,
        grievanceId: escalation.grievanceId,
        type: 'ESCALATION',
        title: 'Escalated grievance assigned to you',
        body: `${grievance.caseNumber ?? 'A grievance'} is assigned to you at escalation level ${updated.level}.`,
        idempotencyKey: `m4:reviewer-assignment:${updated.id}:${reviewer.id}`,
      });
      await tx.auditLog.create({
        data: auditData({
          actorId: actor.userId,
          grievanceId: escalation.grievanceId,
          action: 'REVIEWER_ASSIGNED_MANUALLY',
          requestId,
          details: { escalationId: escalation.id, level: escalation.level, reviewerId },
        }),
      });
    });
  }

  async escalate(
    actor: GrievanceActor,
    grievanceId: string,
    reason: string,
    requestId: string,
  ): Promise<GrievanceDetail> {
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM grievances WHERE id = ${grievanceId}::uuid FOR UPDATE`;
      const current = await tx.grievance.findFirst({
        where: { id: grievanceId, ...visibleWhere(actor) },
      });
      if (!current) missing();
      if (
        current.status === 'CLOSED' ||
        current.status === 'RESOLVED' ||
        current.status === 'WITHDRAWN'
      ) {
        throw new AppError(
          409,
          'INVALID_STATE',
          'Resolved, closed or withdrawn grievances cannot be escalated.',
        );
      }
      let priorLevel: { id: string; level: number; state: string } | null = null;
      if (actor.role === 'HANDLER') {
        if (current.status !== 'UNDER_REVIEW')
          throw new AppError(
            409,
            'INVALID_STATE',
            'A handler can escalate only a grievance under review.',
          );
        const assignment = await tx.assignment.findFirst({
          where: { grievanceId, handlerId: actor.userId, endedAt: null },
          select: { id: true },
        });
        if (!assignment) missing();
      } else {
        if (current.status !== 'ESCALATED')
          throw new AppError(
            409,
            'INVALID_STATE',
            'Reviewer further escalation requires an escalated grievance.',
          );
        priorLevel = await tx.escalation.findFirst({
          where: { grievanceId, reviewerId: actor.userId, state: 'UNDER_REVIEWER_HANDLING' },
          orderBy: { level: 'desc' },
          select: { id: true, level: true, state: true },
        });
        if (!priorLevel) missing();
        await tx.escalation.update({
          where: { id: priorLevel.id },
          data: { state: 'ESCALATED_FURTHER' },
        });
      }
      const previous = await tx.escalation.findFirst({
        where: { grievanceId },
        orderBy: { level: 'desc' },
        select: { id: true, level: true },
      });
      const level = (previous?.level ?? 0) + 1;
      const rule = current.categoryId
        ? await tx.escalationRule.findFirst({
            where: {
              categoryId: current.categoryId,
              level,
              isActive: true,
              reviewer: { isActive: true, role: 'REVIEWER' },
            },
            select: { reviewerId: true },
          })
        : null;
      const at = new Date();
      const escalation = await tx.escalation.create({
        data: {
          grievanceId,
          level,
          escalatedById: actor.userId,
          reviewerId: rule?.reviewerId ?? null,
          reasonType: actor.role === 'HANDLER' ? 'MANUAL' : 'FURTHER_REVIEW',
          reason,
          state: rule?.reviewerId ? 'REVIEWER_ASSIGNED' : 'AWAITING_MANUAL',
          reviewerAssignedAt: rule?.reviewerId ? at : null,
          previousLevelId: previous?.id ?? null,
        },
      });
      if (actor.role === 'HANDLER') {
        await tx.grievance.update({
          where: { id: grievanceId },
          data: { status: 'ESCALATED', version: { increment: 1 } },
        });
        await tx.statusHistory.create({
          data: {
            grievanceId,
            previousStatus: 'UNDER_REVIEW',
            newStatus: 'ESCALATED',
            actorId: actor.userId,
            actorRoleSnapshot: 'HANDLER',
            reason,
            publicNote: 'The grievance was escalated for higher-level review.',
            occurredAt: at,
            requestId,
          },
        });
      }
      const adminRows = await tx.user.findMany({
        where: { role: 'ADMINISTRATOR', isActive: true },
        select: { id: true },
      });
      for (const admin of adminRows) {
        await this.createNotification(tx, {
          recipientId: admin.id,
          grievanceId,
          type: rule?.reviewerId ? 'ESCALATION' : 'MANUAL_ASSIGNMENT_REQUIRED',
          title: rule?.reviewerId ? 'Grievance escalated' : 'Reviewer assignment required',
          body: `${current.caseNumber ?? 'A grievance'} reached escalation level ${level}${rule?.reviewerId ? '.' : ' and needs a reviewer.'}`,
          idempotencyKey: `m4:escalation:${escalation.id}:admin:${admin.id}`,
        });
      }
      if (rule?.reviewerId) {
        await this.createNotification(tx, {
          recipientId: rule.reviewerId,
          grievanceId,
          type: 'ESCALATION',
          title: 'Escalated grievance assigned to you',
          body: `${current.caseNumber ?? 'A grievance'} is assigned to you at escalation level ${level}.`,
          idempotencyKey: `m4:escalation:${escalation.id}:reviewer:${rule.reviewerId}`,
        });
      }
      await this.createNotification(tx, {
        recipientId: current.studentId,
        grievanceId,
        type: 'STATUS_CHANGE',
        title: 'Grievance escalated',
        body: `${current.caseNumber ?? 'Your grievance'} has been escalated for higher-level review.`,
        idempotencyKey: `m4:escalation:${escalation.id}:student`,
      });
      await tx.auditLog.create({
        data: auditData({
          actorId: actor.userId,
          grievanceId,
          action: 'GRIEVANCE_ESCALATED',
          requestId,
          details: {
            escalationId: escalation.id,
            level,
            reasonType: escalation.reasonType,
            reviewerId: escalation.reviewerId,
            state: escalation.state,
          },
        }),
      });
      return tx.grievance.findUniqueOrThrow({ where: { id: grievanceId }, include: detailInclude });
    });
    return mapDetail(record, actor);
  }

  async addEvidence(
    actor: GrievanceActor,
    grievanceId: string,
    files: EvidenceMetadataInput[],
    requestId: string,
  ): Promise<GrievanceEvidence[]> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM grievances WHERE id = ${grievanceId}::uuid FOR UPDATE`;
      const grievance = await tx.grievance.findFirst({
        where: { id: grievanceId, studentId: actor.userId },
      });
      if (!grievance) missing();
      const activeAssignment = await tx.assignment.findFirst({
        where: { grievanceId, endedAt: null },
        select: { id: true },
      });
      if (!['DRAFT', 'PENDING_MANUAL_ASSIGNMENT'].includes(grievance.status) || activeAssignment) {
        throw new AppError(
          409,
          'GRIEVANCE_LOCKED',
          'Evidence can only be attached before handler assignment.',
        );
      }
      const evidence = [];
      for (const file of files) {
        const created = await tx.evidence.create({
          data: {
            grievanceId,
            ...file,
            sha256: Buffer.from(file.sha256),
          },
        });
        evidence.push({
          id: created.id,
          originalName: created.originalName,
          mediaType: created.mediaType,
          sizeBytes: Number(created.sizeBytes),
          uploadedAt: created.uploadedAt.toISOString(),
        });
        await tx.auditLog.create({
          data: auditData({
            actorId: actor.userId,
            grievanceId,
            action: 'EVIDENCE_UPLOADED',
            requestId,
            details: {
              evidenceId: created.id,
              mediaType: created.mediaType,
              sizeBytes: Number(created.sizeBytes),
            },
          }),
        });
      }
      return evidence;
    });
  }

  async auditRejectedEvidence(
    actor: GrievanceActor,
    grievanceId: string,
    rejectedCount: number,
    requestId: string,
  ): Promise<void> {
    const grievance = await this.prisma.grievance.findFirst({
      where: { id: grievanceId, studentId: actor.userId },
      select: { id: true, status: true },
    });
    if (!grievance) missing();
    if (!['DRAFT', 'PENDING_MANUAL_ASSIGNMENT'].includes(grievance.status)) {
      throw new AppError(
        409,
        'GRIEVANCE_LOCKED',
        'Evidence can only be attached before handler assignment.',
      );
    }
    await this.prisma.auditLog.create({
      data: auditData({
        actorId: actor.userId,
        grievanceId,
        action: 'EVIDENCE_UPLOAD_REJECTED',
        requestId,
        details: { rejectedCount },
      }),
    });
  }

  async getEvidence(
    actor: GrievanceActor,
    grievanceId: string,
    evidenceId: string,
    requestId: string,
  ): Promise<{
    storageKey: string;
    mediaType: string;
    originalName: string;
  }> {
    if (!['STUDENT', 'HANDLER', 'REVIEWER', 'ADMINISTRATOR'].includes(actor.role)) missing();
    const where: Prisma.EvidenceWhereInput = {
      id: evidenceId,
      grievanceId,
      deletedAt: null,
      grievance: visibleWhere(actor),
    };
    const record = await this.prisma.evidence.findFirst({ where });
    if (!record) {
      missing();
    }
    await this.prisma.auditLog.create({
      data: auditData({
        actorId: actor.userId,
        grievanceId,
        action: 'EVIDENCE_DOWNLOADED',
        requestId,
        details: { evidenceId },
      }),
    });
    return {
      storageKey: record.storageKey,
      mediaType: record.mediaType,
      originalName: record.originalName,
    };
  }

  private async createNotification(
    tx: Prisma.TransactionClient,
    input: {
      recipientId: string;
      grievanceId: string;
      type: Prisma.NotificationCreateInput['type'];
      title: string;
      body: string;
      idempotencyKey: string;
    },
  ): Promise<void> {
    const notification = await tx.notification.create({
      data: {
        recipientId: input.recipientId,
        grievanceId: input.grievanceId,
        type: input.type,
        title: input.title,
        body: input.body,
        safePayload: { grievanceId: input.grievanceId },
      },
    });
    await tx.notificationOutbox.create({
      data: {
        notificationId: notification.id,
        channel: 'IN_APP',
        idempotencyKey: input.idempotencyKey,
      },
    });
  }
}
