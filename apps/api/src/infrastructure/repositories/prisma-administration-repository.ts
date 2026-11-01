import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../errors/app-error.js';
import type { AdministrationRepository } from '../../modules/administration/application/ports.js';

const categoryInclude = {
  handlerMappings: {
    where: { activeTo: null },
    include: { handler: { select: { id: true, name: true, email: true } } },
    orderBy: [{ isPrimary: 'desc' }, { activeFrom: 'asc' }],
  },
  escalationRules: {
    include: { reviewer: { select: { id: true, name: true } } },
    orderBy: { level: 'asc' },
  },
} satisfies Prisma.CategoryInclude;

type CategoryRecord = Prisma.CategoryGetPayload<{ include: typeof categoryInclude }>;

function mapCategory(record: CategoryRecord) {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    isActive: record.isActive,
    slaHours: record.slaHours,
    policyVersion: record.policyVersion,
    handlers: record.handlerMappings.map((mapping) => ({
      id: mapping.id,
      handlerId: mapping.handler.id,
      handlerName: mapping.handler.name,
      handlerEmail: mapping.handler.email,
      isPrimary: mapping.isPrimary,
      activeFrom: mapping.activeFrom.toISOString(),
    })),
    escalationRules: record.escalationRules.map((rule) => ({
      id: rule.id,
      level: rule.level,
      reviewerId: rule.reviewerId,
      reviewerName: rule.reviewer?.name ?? null,
      timelineHours: rule.timelineHours,
      isActive: rule.isActive,
    })),
  };
}

function auditData(input: {
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  requestId: string;
  details: Prisma.InputJsonObject;
}) {
  return { ...input, source: 'ADMIN' as const };
}

function missingCategory(): never {
  throw new AppError(404, 'CATEGORY_NOT_FOUND', 'Category was not found.');
}

function conflict(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
    throw new AppError(409, 'CONFIGURATION_CONFLICT', 'That category or mapping already exists.');
  }
  throw error;
}

export class PrismaAdministrationRepository implements AdministrationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listCategories(): Promise<ReturnType<typeof mapCategory>[]> {
    const categories = await this.prisma.category.findMany({
      include: categoryInclude,
      orderBy: { name: 'asc' },
    });
    return categories.map(mapCategory);
  }

  async createCategory(input: Parameters<AdministrationRepository['createCategory']>[0]) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertAdministrator(tx, input.actorId);
        const record = await tx.category.create({
          data: {
            name: input.name,
            description: input.description,
            slaHours: input.slaHours,
            createdById: input.actorId,
          },
        });
        await tx.auditLog.create({
          data: auditData({
            actorId: input.actorId,
            entityType: 'CATEGORY',
            entityId: record.id,
            action: 'ADMIN_CATEGORY_CREATED',
            requestId: input.requestId,
            details: { name: record.name, slaHours: record.slaHours },
          }),
        });
        return mapCategory(
          await tx.category.findUniqueOrThrow({
            where: { id: record.id },
            include: categoryInclude,
          }),
        );
      });
    } catch (error) {
      return conflict(error);
    }
  }

  async updateCategory(input: Parameters<AdministrationRepository['updateCategory']>[0]) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertAdministrator(tx, input.actorId);
        await tx.$queryRaw`SELECT id FROM categories WHERE id = ${input.categoryId}::uuid FOR UPDATE`;
        const current = await tx.category.findUnique({ where: { id: input.categoryId } });
        if (!current) missingCategory();
        const updated = await tx.category.update({
          where: { id: current.id },
          data: {
            ...input.changes,
            policyVersion: { increment: 1 },
          },
        });
        await tx.auditLog.create({
          data: auditData({
            actorId: input.actorId,
            entityType: 'CATEGORY',
            entityId: current.id,
            action: 'ADMIN_CATEGORY_UPDATED',
            requestId: input.requestId,
            details: {
              changedFields: Object.keys(input.changes),
              before: {
                name: current.name,
                description: current.description,
                isActive: current.isActive,
                slaHours: current.slaHours,
                policyVersion: current.policyVersion,
              },
              after: {
                name: updated.name,
                description: updated.description,
                isActive: updated.isActive,
                slaHours: updated.slaHours,
                policyVersion: updated.policyVersion,
              },
            },
          }),
        });
        return mapCategory(
          await tx.category.findUniqueOrThrow({
            where: { id: current.id },
            include: categoryInclude,
          }),
        );
      });
    } catch (error) {
      return conflict(error);
    }
  }

  async addHandlerMapping(input: Parameters<AdministrationRepository['addHandlerMapping']>[0]) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertAdministrator(tx, input.actorId);
        await tx.$queryRaw`SELECT id FROM categories WHERE id = ${input.categoryId}::uuid FOR UPDATE`;
        const category = await tx.category.findUnique({ where: { id: input.categoryId } });
        if (!category) missingCategory();
        const handler = await tx.user.findFirst({
          where: { id: input.handlerId, role: 'HANDLER', isActive: true },
          select: { id: true },
        });
        if (!handler)
          throw new AppError(400, 'INVALID_HANDLER', 'Choose an active handler account.');
        if (input.isPrimary) {
          await tx.categoryHandler.updateMany({
            where: { categoryId: input.categoryId, activeTo: null, isPrimary: true },
            data: { isPrimary: false },
          });
        }
        const mapping = await tx.categoryHandler.create({
          data: {
            categoryId: input.categoryId,
            handlerId: input.handlerId,
            isPrimary: input.isPrimary,
            createdById: input.actorId,
          },
        });
        await tx.category.update({
          where: { id: input.categoryId },
          data: { policyVersion: { increment: 1 } },
        });
        await tx.auditLog.create({
          data: auditData({
            actorId: input.actorId,
            entityType: 'CATEGORY_HANDLER',
            entityId: mapping.id,
            action: 'ADMIN_HANDLER_MAPPED',
            requestId: input.requestId,
            details: {
              categoryId: input.categoryId,
              handlerId: input.handlerId,
              isPrimary: input.isPrimary,
            },
          }),
        });
        return mapCategory(
          await tx.category.findUniqueOrThrow({
            where: { id: input.categoryId },
            include: categoryInclude,
          }),
        );
      });
    } catch (error) {
      return conflict(error);
    }
  }

  async endHandlerMapping(input: Parameters<AdministrationRepository['endHandlerMapping']>[0]) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertAdministrator(tx, input.actorId);
      await tx.$queryRaw`SELECT id FROM categories WHERE id = ${input.categoryId}::uuid FOR UPDATE`;
      const mapping = await tx.categoryHandler.findFirst({
        where: { id: input.mappingId, categoryId: input.categoryId, activeTo: null },
      });
      if (!mapping)
        throw new AppError(404, 'MAPPING_NOT_FOUND', 'Active handler mapping was not found.');
      const endedAt = new Date(Math.max(Date.now(), mapping.activeFrom.getTime() + 1));
      await tx.categoryHandler.update({
        where: { id: mapping.id },
        data: { activeTo: endedAt, isPrimary: false },
      });
      await tx.category.update({
        where: { id: input.categoryId },
        data: { policyVersion: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: auditData({
          actorId: input.actorId,
          entityType: 'CATEGORY_HANDLER',
          entityId: mapping.id,
          action: 'ADMIN_HANDLER_MAPPING_ENDED',
          requestId: input.requestId,
          details: { categoryId: input.categoryId, handlerId: mapping.handlerId },
        }),
      });
      return mapCategory(
        await tx.category.findUniqueOrThrow({
          where: { id: input.categoryId },
          include: categoryInclude,
        }),
      );
    });
  }

  async setPrimaryHandler(input: Parameters<AdministrationRepository['setPrimaryHandler']>[0]) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertAdministrator(tx, input.actorId);
      await tx.$queryRaw`SELECT id FROM categories WHERE id = ${input.categoryId}::uuid FOR UPDATE`;
      const mapping = await tx.categoryHandler.findFirst({
        where: {
          id: input.mappingId,
          categoryId: input.categoryId,
          activeTo: null,
          handler: { isActive: true },
        },
      });
      if (!mapping)
        throw new AppError(404, 'MAPPING_NOT_FOUND', 'Active handler mapping was not found.');
      await tx.categoryHandler.updateMany({
        where: { categoryId: input.categoryId, activeTo: null, isPrimary: true },
        data: { isPrimary: false },
      });
      await tx.categoryHandler.update({ where: { id: mapping.id }, data: { isPrimary: true } });
      await tx.category.update({
        where: { id: input.categoryId },
        data: { policyVersion: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: auditData({
          actorId: input.actorId,
          entityType: 'CATEGORY_HANDLER',
          entityId: mapping.id,
          action: 'ADMIN_PRIMARY_HANDLER_CHANGED',
          requestId: input.requestId,
          details: { categoryId: input.categoryId, handlerId: mapping.handlerId },
        }),
      });
      return mapCategory(
        await tx.category.findUniqueOrThrow({
          where: { id: input.categoryId },
          include: categoryInclude,
        }),
      );
    });
  }

  async saveEscalationRule(input: Parameters<AdministrationRepository['saveEscalationRule']>[0]) {
    return this.prisma.$transaction(async (tx) => {
      await this.assertAdministrator(tx, input.actorId);
      await tx.$queryRaw`SELECT id FROM categories WHERE id = ${input.categoryId}::uuid FOR UPDATE`;
      const category = await tx.category.findUnique({ where: { id: input.categoryId } });
      if (!category) missingCategory();
      if (input.reviewerId) {
        const reviewer = await tx.user.findFirst({
          where: { id: input.reviewerId, role: 'REVIEWER', isActive: true },
          select: { id: true },
        });
        if (!reviewer)
          throw new AppError(400, 'INVALID_REVIEWER', 'Choose an active reviewer account.');
      }
      const rule = await tx.escalationRule.upsert({
        where: { categoryId_level: { categoryId: input.categoryId, level: input.level } },
        create: {
          categoryId: input.categoryId,
          level: input.level,
          reviewerId: input.reviewerId,
          timelineHours: input.timelineHours,
          isActive: input.isActive,
          createdById: input.actorId,
        },
        update: {
          reviewerId: input.reviewerId,
          timelineHours: input.timelineHours,
          isActive: input.isActive,
        },
      });
      await tx.auditLog.create({
        data: auditData({
          actorId: input.actorId,
          entityType: 'ESCALATION_RULE',
          entityId: rule.id,
          action: 'ADMIN_ESCALATION_RULE_SAVED',
          requestId: input.requestId,
          details: {
            categoryId: input.categoryId,
            level: input.level,
            reviewerId: input.reviewerId,
            timelineHours: input.timelineHours,
            isActive: input.isActive,
          },
        }),
      });
      return mapCategory(
        await tx.category.findUniqueOrThrow({
          where: { id: input.categoryId },
          include: categoryInclude,
        }),
      );
    });
  }

  async listDirectory(query: string | undefined) {
    const users = await this.prisma.user.findMany({
      where: {
        role: { in: ['HANDLER', 'REVIEWER'] },
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: 'insensitive' } },
                { email: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: {
        department: { select: { name: true } },
        categoryHandlers: {
          where: { activeTo: null, category: { isActive: true } },
          include: { category: { select: { name: true } } },
        },
        escalationRules: {
          where: { isActive: true, category: { isActive: true } },
          include: { category: { select: { name: true } } },
        },
      },
      orderBy: [{ name: 'asc' }, { email: 'asc' }],
    });
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as 'HANDLER' | 'REVIEWER',
      departmentName: user.department?.name ?? null,
      isActive: user.isActive,
      categories: [
        ...new Set([
          ...user.categoryHandlers.map((mapping) => mapping.category.name),
          ...user.escalationRules.map((rule) => rule.category.name),
        ]),
      ].sort((a, b) => a.localeCompare(b)),
    }));
  }

  private async assertAdministrator(tx: Prisma.TransactionClient, actorId: string): Promise<void> {
    const actor = await tx.user.findUnique({
      where: { id: actorId },
      select: { role: true, isActive: true },
    });
    if (!actor?.isActive || actor.role !== 'ADMINISTRATOR') {
      throw new AppError(403, 'FORBIDDEN', 'Administrator access is required.');
    }
  }
}
