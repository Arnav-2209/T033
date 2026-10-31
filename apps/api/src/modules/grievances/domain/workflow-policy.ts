import { AppError } from '../../../infrastructure/errors/app-error.js';
import type { GrievanceStatus, UserRole } from '@sgrs/contracts';

const handlerTransitions: Partial<Record<GrievanceStatus, readonly GrievanceStatus[]>> = {
  ASSIGNED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['AWAITING_INFORMATION', 'ESCALATED'],
  AWAITING_INFORMATION: ['UNDER_REVIEW'],
};

export function requireHandlerTransition(current: GrievanceStatus, next: GrievanceStatus): void {
  if (!handlerTransitions[current]?.includes(next)) {
    throw new AppError(409, 'INVALID_STATE', `Cannot change a ${current} grievance to ${next}.`);
  }
}

export function requireRole(role: UserRole, allowed: readonly UserRole[], message: string): void {
  if (!allowed.includes(role)) throw new AppError(403, 'FORBIDDEN', message);
}

export function validateCaseMessage(body: string): string {
  const normalized = body.trim();
  if (!normalized) throw new AppError(400, 'MESSAGE_REQUIRED', 'Enter a message before saving.');
  if (normalized.length > 20_000) {
    throw new AppError(400, 'MESSAGE_TOO_LONG', 'Message must be 20,000 characters or fewer.');
  }
  return normalized;
}

export function validateEscalationReason(reason: string): string {
  const normalized = reason.trim();
  if (!normalized)
    throw new AppError(400, 'REASON_REQUIRED', 'A reason is required for every escalation.');
  if (normalized.length > 4_000) {
    throw new AppError(
      400,
      'REASON_TOO_LONG',
      'Escalation reason must be 4,000 characters or fewer.',
    );
  }
  return normalized;
}
