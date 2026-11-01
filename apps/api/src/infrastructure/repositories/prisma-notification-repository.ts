import type { PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../errors/app-error.js';
import type { NotificationRepository } from '../../modules/notifications/application/ports.js';

export class PrismaNotificationRepository implements NotificationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listForRecipient(input: Parameters<NotificationRepository['listForRecipient']>[0]) {
    const where = { recipientId: input.recipientId };
    const [records, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return {
      items: records.map((record) => ({
        id: record.id,
        grievanceId: record.grievanceId,
        type: record.type,
        title: record.title,
        body: record.body,
        createdAt: record.createdAt.toISOString(),
        readAt: record.readAt?.toISOString() ?? null,
      })),
      total,
      unreadCount,
    };
  }

  async markRead(input: Parameters<NotificationRepository['markRead']>[0]): Promise<void> {
    const result = await this.prisma.notification.updateMany({
      where: { id: input.notificationId, recipientId: input.recipientId, readAt: null },
      data: { readAt: input.readAt },
    });
    if (result.count === 0) {
      const existing = await this.prisma.notification.findFirst({
        where: { id: input.notificationId, recipientId: input.recipientId },
        select: { id: true },
      });
      if (!existing)
        throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification was not found.');
    }
  }
}
