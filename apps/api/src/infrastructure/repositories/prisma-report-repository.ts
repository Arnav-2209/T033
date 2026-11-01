import type { GrievanceStatus, Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../errors/app-error.js';
import type { ReportRepository } from '../../modules/reports/application/ports.js';

const terminalStatuses: GrievanceStatus[] = ['RESOLVED', 'CLOSED', 'WITHDRAWN'];

export class PrismaReportRepository implements ReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async overview(now: Date) {
    const [totalCases, groups, overdueCases] = await this.prisma.$transaction([
      this.prisma.grievance.count({ where: { submittedAt: { not: null } } }),
      this.prisma.grievance.groupBy({
        by: ['status'],
        where: { submittedAt: { not: null } },
        _count: { status: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.grievance.count({
        where: {
          submittedAt: { not: null },
          resolutionDeadline: { lt: now },
          status: { notIn: terminalStatuses },
        },
      }),
    ]);
    const byStatus = Object.fromEntries(
      groups.map((group) => [
        group.status,
        typeof group._count === 'object' ? (group._count.status ?? 0) : 0,
      ]),
    );
    const openCases = Object.entries(byStatus).reduce(
      (sum, [status, count]) =>
        status === 'DRAFT' || terminalStatuses.includes(status as (typeof terminalStatuses)[number])
          ? sum
          : sum + count,
      0,
    );
    return { totalCases, openCases, overdueCases, byStatus };
  }

  async categories(input: { from: Date; to: Date }) {
    const where: Prisma.GrievanceWhereInput = {
      submittedAt: { gte: input.from, lt: input.to },
    };
    const groups = await this.prisma.grievance.groupBy({
      by: ['categoryId', 'status'],
      where,
      _count: { status: true },
      orderBy: [{ categoryId: 'asc' }, { status: 'asc' }],
    });
    const categories = await this.prisma.category.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const names = new Map(categories.map((category) => [category.id, category.name]));
    const result = new Map<
      string,
      {
        categoryId: string | null;
        categoryName: string;
        total: number;
        byStatus: Record<string, number>;
      }
    >();
    for (const group of groups) {
      const key = group.categoryId ?? 'uncategorized';
      const row = result.get(key) ?? {
        categoryId: group.categoryId,
        categoryName: group.categoryId
          ? (names.get(group.categoryId) ?? 'Unknown category')
          : 'Uncategorized',
        total: 0,
        byStatus: {},
      };
      const count = typeof group._count === 'object' ? (group._count.status ?? 0) : 0;
      row.total += count;
      row.byStatus[group.status] = count;
      result.set(key, row);
    }
    return [...result.values()].sort((a, b) => a.categoryName.localeCompare(b.categoryName));
  }

  async handlers(input: { from: Date; to: Date }) {
    const [users, activeGroups, resolutionEvents] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'HANDLER' },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.assignment.groupBy({
        by: ['handlerId'],
        where: {
          endedAt: null,
          handler: { isActive: true },
          grievance: { is: { status: { notIn: [...terminalStatuses, 'DRAFT'] } } },
        },
        _count: { handlerId: true },
      }),
      this.prisma.resolutionCycle.findMany({
        where: {
          cycleNumber: 1,
          resolvedBy: { role: 'HANDLER' },
          grievance: { is: { submittedAt: { gte: input.from, lt: input.to } } },
        },
        select: {
          grievanceId: true,
          resolvedById: true,
          resolvedAt: true,
          grievance: { select: { submittedAt: true } },
        },
        orderBy: [{ resolvedAt: 'asc' }, { id: 'asc' }],
      }),
    ]);
    const active = new Map(
      activeGroups.map((group) => [
        group.handlerId,
        typeof group._count === 'object' ? (group._count.handlerId ?? 0) : 0,
      ]),
    );
    const resolved = new Map<string, number[]>();
    for (const event of resolutionEvents) {
      if (!event.grievance.submittedAt) continue;
      const durations = resolved.get(event.resolvedById) ?? [];
      durations.push(
        (event.resolvedAt.getTime() - event.grievance.submittedAt.getTime()) / 3_600_000,
      );
      resolved.set(event.resolvedById, durations);
    }
    return users.map((user) => {
      const durations = resolved.get(user.id) ?? [];
      return {
        handlerId: user.id,
        handlerName: user.name,
        activeAssignments: active.get(user.id) ?? 0,
        resolvedCount: durations.length,
        averageHoursToFirstResolution:
          durations.length > 0
            ? Math.round(
                (durations.reduce((sum, value) => sum + value, 0) / durations.length) * 100,
              ) / 100
            : null,
      };
    });
  }

  async auditTrail(input: { grievanceId: string; page: number; pageSize: number }) {
    const exists = await this.prisma.grievance.findUnique({
      where: { id: input.grievanceId },
      select: { id: true },
    });
    if (!exists) throw new AppError(404, 'GRIEVANCE_NOT_FOUND', 'Grievance was not found.');
    const where = { grievanceId: input.grievanceId };
    const [events, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: { actor: { select: { name: true, role: true } } },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return {
      items: events.map((event) => ({
        id: event.id.toString(),
        actorName: event.actor?.name ?? null,
        actorRole: event.actor?.role ?? null,
        action: event.action,
        details: event.details,
        source: event.source,
        occurredAt: event.occurredAt.toISOString(),
        requestId: event.requestId,
      })),
      total,
    };
  }
}
