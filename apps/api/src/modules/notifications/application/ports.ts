import type { NotificationItem } from '@sgrs/contracts';

export interface NotificationRepository {
  listForRecipient(input: {
    recipientId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: NotificationItem[]; total: number; unreadCount: number }>;
  markRead(input: { recipientId: string; notificationId: string; readAt: Date }): Promise<void>;
}
