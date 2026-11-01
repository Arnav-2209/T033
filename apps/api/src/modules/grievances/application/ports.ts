import type {
  GrievanceCategoryOption,
  GrievanceDetail,
  GrievanceEvidence,
  GrievanceListResponse,
  HandlerWorkloadResponse,
  ReviewerQueueResponse,
  ManualReviewerAssignmentResponse,
  GrievanceStatus,
  GrievancePriority,
  UserRole,
} from '@sgrs/contracts';
import type { GrievancePatch } from '../domain/validation.js';

export interface GrievanceActor {
  userId: string;
  role: UserRole;
}

export interface EvidenceMetadataInput {
  uploadedById: string;
  originalName: string;
  storageKey: string;
  mediaType: string;
  sizeBytes: number;
  sha256: Uint8Array;
}

export interface SubmissionContext {
  grievanceId: string;
  studentId: string;
  status: GrievanceStatus;
  version: number;
  fields: {
    title: string | null;
    description: string | null;
    categoryId: string | null;
    incidentDate: string | null;
    location: string | null;
    priority: GrievancePriority;
  };
  category: null | {
    id: string;
    name: string;
    isActive: boolean;
    slaHours: number;
    policyVersion: number;
    primaryHandlers: Array<{
      handlerId: string;
      name: string;
      role: UserRole;
      isActive: boolean;
      activeFrom: Date;
      activeTo: Date | null;
    }>;
  };
}

export interface SubmissionPlan {
  handlerId: string | null;
  slaHours: number;
  policyVersion: number;
  resolutionDeadline: Date;
  at: Date;
}

export interface GrievanceListInput {
  actor: GrievanceActor;
  page: number;
  pageSize: number;
  status?: GrievanceStatus;
  query?: string;
  sort?: 'updated' | 'deadline' | 'status';
}

export interface CaseMessageInput {
  messageType: 'INFO_REQUEST' | 'INTERNAL_NOTE' | 'STUDENT_RESPONSE' | 'PUBLIC_NOTE';
  body: string;
  inReplyToId?: string;
}

export interface ReviewerOption {
  id: string;
  name: string;
  email: string;
}

export interface GrievanceRepository {
  listCategories(): Promise<GrievanceCategoryOption[]>;
  createDraft(actor: GrievanceActor, requestId: string): Promise<GrievanceDetail>;
  list(input: GrievanceListInput): Promise<GrievanceListResponse['data']>;
  get(actor: GrievanceActor, grievanceId: string): Promise<GrievanceDetail>;
  getSubmissionContext(actor: GrievanceActor, grievanceId: string): Promise<SubmissionContext>;
  findSubmittedByKey(actor: GrievanceActor, submissionKey: string): Promise<GrievanceDetail | null>;
  update(
    actor: GrievanceActor,
    input: {
      grievanceId: string;
      expectedVersion: number;
      patch: GrievancePatch;
      requestId: string;
    },
  ): Promise<GrievanceDetail>;
  submit(
    actor: GrievanceActor,
    input: {
      grievanceId: string;
      expectedVersion: number;
      submissionKey: string;
      plan: SubmissionPlan;
      requestId: string;
    },
  ): Promise<GrievanceDetail>;
  withdraw(actor: GrievanceActor, grievanceId: string, requestId: string): Promise<GrievanceDetail>;
  resolveGrievance(
    actor: GrievanceActor,
    grievanceId: string,
    remarks: string,
    resolvedAt: Date,
    feedbackDeadline: Date,
    requestId: string,
  ): Promise<GrievanceDetail>;
  submitFeedback(
    actor: GrievanceActor,
    grievanceId: string,
    rating: number,
    comment: string | null,
    submittedAt: Date,
    requestId: string,
  ): Promise<GrievanceDetail>;
  closeExpiredResolutionCycles(now: Date, batchSize: number, jobRunId: string): Promise<number>;
  setHandlerUnderReview(
    actor: GrievanceActor,
    grievanceId: string,
    requestId: string,
  ): Promise<GrievanceDetail>;
  addHandlerMessage(
    actor: GrievanceActor,
    grievanceId: string,
    input: CaseMessageInput,
    requestId: string,
  ): Promise<GrievanceDetail>;
  respondToInformationRequest(
    actor: GrievanceActor,
    grievanceId: string,
    requestIdId: string,
    body: string,
    requestId: string,
  ): Promise<GrievanceDetail>;
  addReviewerDirection(
    actor: GrievanceActor,
    grievanceId: string,
    body: string,
    requestId: string,
  ): Promise<GrievanceDetail>;
  escalate(
    actor: GrievanceActor,
    grievanceId: string,
    reason: string,
    requestId: string,
  ): Promise<GrievanceDetail>;
  startReviewerHandling(
    actor: GrievanceActor,
    grievanceId: string,
    level: number,
    requestId: string,
  ): Promise<GrievanceDetail>;
  assignReviewer(
    actor: GrievanceActor,
    escalationId: string,
    reviewerId: string,
    requestId: string,
  ): Promise<void>;
  reviewerQueue(
    actor: GrievanceActor,
    input: { page: number; pageSize: number; query?: string },
  ): Promise<ReviewerQueueResponse['data']>;
  handlerWorkload(actor: GrievanceActor): Promise<HandlerWorkloadResponse['data']>;
  activeReviewers(actor: GrievanceActor): Promise<ReviewerOption[]>;
  manualReviewerAssignments(
    actor: GrievanceActor,
  ): Promise<ManualReviewerAssignmentResponse['data']['items']>;
  addEvidence(
    actor: GrievanceActor,
    grievanceId: string,
    files: EvidenceMetadataInput[],
    requestId: string,
  ): Promise<GrievanceEvidence[]>;
  auditRejectedEvidence(
    actor: GrievanceActor,
    grievanceId: string,
    rejectedCount: number,
    requestId: string,
  ): Promise<void>;
  getEvidence(
    actor: GrievanceActor,
    grievanceId: string,
    evidenceId: string,
    requestId: string,
  ): Promise<{
    storageKey: string;
    mediaType: string;
    originalName: string;
  }>;
}
