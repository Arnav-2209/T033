import type { GrievanceDetail } from '@sgrs/contracts';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import type { GrievanceActor, GrievanceRepository } from './ports.js';
import {
  validateFeedbackActor,
  validateFeedbackRating,
  validateResolutionActor,
  validateResolutionRemarks,
} from '../domain/resolution-policy.js';

const FEEDBACK_WINDOW_MS = 3 * 24 * 60 * 60 * 1_000;

export class ResolutionService {
  constructor(
    private readonly repository: GrievanceRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  resolve(
    actor: GrievanceActor,
    grievanceId: string,
    remarks: string,
    requestId: string,
  ): Promise<GrievanceDetail> {
    validateResolutionActor(actor.role);
    const resolvedAt = this.now();
    return this.repository.resolveGrievance(
      actor,
      grievanceId,
      validateResolutionRemarks(remarks),
      resolvedAt,
      new Date(resolvedAt.getTime() + FEEDBACK_WINDOW_MS),
      requestId,
    );
  }

  submitFeedback(
    actor: GrievanceActor,
    grievanceId: string,
    rating: number,
    comment: string | null,
    requestId: string,
  ): Promise<GrievanceDetail> {
    validateFeedbackActor(actor.role);
    const normalizedComment = comment?.trim() || null;
    return this.repository.submitFeedback(
      actor,
      grievanceId,
      validateFeedbackRating(rating),
      normalizedComment,
      this.now(),
      requestId,
    );
  }

  closeExpiredFeedback(
    now = this.now(),
    batchSize = 100,
    jobRunId: string = crypto.randomUUID(),
  ): Promise<number> {
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
      throw new AppError(500, 'INVALID_BATCH_SIZE', 'Closure job batch size is invalid.');
    }
    return this.repository.closeExpiredResolutionCycles(now, batchSize, jobRunId);
  }
}
