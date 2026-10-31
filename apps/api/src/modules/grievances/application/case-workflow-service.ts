import type { GrievanceDetail } from '@sgrs/contracts';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import type { CaseMessageInput, GrievanceActor, GrievanceRepository } from './ports.js';
import {
  requireHandlerTransition,
  requireRole,
  validateCaseMessage,
  validateEscalationReason,
} from '../domain/workflow-policy.js';

export class CaseWorkflowService {
  constructor(private readonly repository: GrievanceRepository) {}

  startHandlerReview(
    actor: GrievanceActor,
    grievanceId: string,
    requestId: string,
  ): Promise<GrievanceDetail> {
    requireRole(actor.role, ['HANDLER'], 'Only an assigned handler can start an investigation.');
    requireHandlerTransition('ASSIGNED', 'UNDER_REVIEW');
    return this.repository.setHandlerUnderReview(actor, grievanceId, requestId);
  }

  addHandlerInternalNote(
    actor: GrievanceActor,
    grievanceId: string,
    body: string,
    requestId: string,
  ): Promise<GrievanceDetail> {
    requireRole(actor.role, ['HANDLER'], 'Only an assigned handler can add investigation notes.');
    return this.repository.addHandlerMessage(
      actor,
      grievanceId,
      {
        messageType: 'INTERNAL_NOTE',
        body: validateCaseMessage(body),
      },
      requestId,
    );
  }

  requestInformation(
    actor: GrievanceActor,
    grievanceId: string,
    body: string,
    requestId: string,
  ): Promise<GrievanceDetail> {
    requireRole(
      actor.role,
      ['HANDLER'],
      'Only an assigned handler can request student information.',
    );
    requireHandlerTransition('UNDER_REVIEW', 'AWAITING_INFORMATION');
    return this.repository.addHandlerMessage(
      actor,
      grievanceId,
      {
        messageType: 'INFO_REQUEST',
        body: validateCaseMessage(body),
      },
      requestId,
    );
  }

  respondToInformation(
    actor: GrievanceActor,
    grievanceId: string,
    informationRequestId: string,
    body: string,
    requestId: string,
  ): Promise<GrievanceDetail> {
    requireRole(
      actor.role,
      ['STUDENT'],
      'Only the grievance owner can respond to an information request.',
    );
    return this.repository.respondToInformationRequest(
      actor,
      grievanceId,
      informationRequestId,
      validateCaseMessage(body),
      requestId,
    );
  }

  escalate(
    actor: GrievanceActor,
    grievanceId: string,
    reason: string,
    requestId: string,
  ): Promise<GrievanceDetail> {
    requireRole(
      actor.role,
      ['HANDLER', 'REVIEWER'],
      'Only an assigned handler or reviewer can escalate a grievance.',
    );
    return this.repository.escalate(
      actor,
      grievanceId,
      validateEscalationReason(reason),
      requestId,
    );
  }

  startReviewerHandling(
    actor: GrievanceActor,
    grievanceId: string,
    level: number,
    requestId: string,
  ): Promise<GrievanceDetail> {
    requireRole(
      actor.role,
      ['REVIEWER'],
      'Only the reviewer assigned to this escalation level can act on it.',
    );
    if (!Number.isInteger(level) || level < 1)
      throw new AppError(400, 'INVALID_LEVEL', 'Escalation level must be a positive integer.');
    return this.repository.startReviewerHandling(actor, grievanceId, level, requestId);
  }

  addReviewerDirection(
    actor: GrievanceActor,
    grievanceId: string,
    body: string,
    requestId: string,
  ): Promise<GrievanceDetail> {
    requireRole(actor.role, ['REVIEWER'], 'Only the assigned reviewer can add a direction.');
    return this.repository.addReviewerDirection(
      actor,
      grievanceId,
      validateCaseMessage(body),
      requestId,
    );
  }

  assignReviewer(
    actor: GrievanceActor,
    escalationId: string,
    reviewerId: string,
    requestId: string,
  ): Promise<void> {
    requireRole(
      actor.role,
      ['ADMINISTRATOR'],
      'Only an administrator can assign a reviewer manually.',
    );
    return this.repository.assignReviewer(actor, escalationId, reviewerId, requestId);
  }

  reviewerQueue(actor: GrievanceActor, input: { page: number; pageSize: number; query?: string }) {
    requireRole(actor.role, ['REVIEWER'], 'Only reviewers can access the escalation queue.');
    return this.repository.reviewerQueue(actor, input);
  }

  handlerWorkload(actor: GrievanceActor) {
    requireRole(actor.role, ['HANDLER'], 'Handler workload is available to handlers only.');
    return this.repository.handlerWorkload(actor);
  }

  activeReviewers(actor: GrievanceActor) {
    requireRole(actor.role, ['ADMINISTRATOR'], 'Only an administrator can list reviewers.');
    return this.repository.activeReviewers(actor);
  }

  manualReviewerAssignments(actor: GrievanceActor) {
    requireRole(
      actor.role,
      ['ADMINISTRATOR'],
      'Only an administrator can view pending reviewer assignments.',
    );
    return this.repository.manualReviewerAssignments(actor);
  }
}

export type { CaseMessageInput };
