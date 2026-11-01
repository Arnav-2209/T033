import type { NotificationListResponse, UserRole } from '@sgrs/contracts';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import type { NotificationRepository } from './ports.js';

export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(
    actor: { userId: string; role: UserRole },
    input: { page: number; pageSize: number },
  ): Promise<NotificationListResponse['data']> {
    const result = await this.repository.listForRecipient({
      recipientId: actor.userId,
      ...input,
    });
    return { ...result, ...input };
  }

  markRead(actor: { userId: string; role: UserRole }, notificationId: string): Promise<void> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        notificationId,
      )
    ) {
      throw new AppError(400, 'VALIDATION_FAILED', 'A valid notification identifier is required.');
    }
    return this.repository.markRead({
      recipientId: actor.userId,
      notificationId,
      readAt: this.now(),
    });
  }
}
