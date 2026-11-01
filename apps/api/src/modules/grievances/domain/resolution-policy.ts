import { AppError } from '../../../infrastructure/errors/app-error.js';
import type { UserRole } from '@sgrs/contracts';

export function validateResolutionRemarks(remarks: string): string {
  const normalized = remarks.trim();
  if (!normalized) {
    throw new AppError(400, 'REMARKS_REQUIRED', 'Resolution remarks are required.');
  }
  return normalized;
}

export function validateFeedbackRating(rating: number): number {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new AppError(400, 'RATING_INVALID', 'Feedback rating must be an integer from 1 to 5.');
  }
  return rating;
}

export function isWithinFeedbackWindow(submittedAt: Date, feedbackDeadline: Date): boolean {
  return submittedAt.getTime() <= feedbackDeadline.getTime();
}

export function validateResolutionActor(role: UserRole): void {
  if (role !== 'HANDLER' && role !== 'REVIEWER') {
    throw new AppError(
      403,
      'FORBIDDEN',
      'Only an assigned handler or reviewer can resolve a grievance.',
    );
  }
}

export function validateFeedbackActor(role: UserRole): void {
  if (role !== 'STUDENT') {
    throw new AppError(403, 'FORBIDDEN', 'Only the original student can submit feedback.');
  }
}
