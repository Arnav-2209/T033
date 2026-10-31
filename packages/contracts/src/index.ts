export const userRoles = ['STUDENT', 'HANDLER', 'REVIEWER', 'ADMINISTRATOR', 'MANAGEMENT'] as const;

export type UserRole = (typeof userRoles)[number];

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  departmentId: string | null;
  contact: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface AuthSessionResponse {
  data: {
    user: PublicUser;
    expiresAt: string;
  };
}

export interface UserListResponse {
  data: {
    items: PublicUser[];
    page: number;
    pageSize: number;
    total: number;
  };
}

export const grievanceStatuses = [
  'DRAFT',
  'SUBMITTED',
  'PENDING_MANUAL_ASSIGNMENT',
  'ASSIGNED',
  'UNDER_REVIEW',
  'AWAITING_INFORMATION',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
  'WITHDRAWN',
] as const;

export type GrievanceStatus = (typeof grievanceStatuses)[number];
export const grievancePriorities = ['NORMAL', 'HIGH'] as const;
export type GrievancePriority = (typeof grievancePriorities)[number];

export interface GrievanceCategoryOption {
  id: string;
  name: string;
  description: string | null;
}

export interface GrievanceEvidence {
  id: string;
  originalName: string;
  mediaType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface GrievanceStatusEvent {
  id: string;
  previousStatus: GrievanceStatus | null;
  newStatus: GrievanceStatus;
  occurredAt: string;
  publicNote: string | null;
}

export const caseMessageTypes = [
  'INFO_REQUEST',
  'STUDENT_RESPONSE',
  'PUBLIC_NOTE',
  'INTERNAL_NOTE',
] as const;
export type CaseMessageType = (typeof caseMessageTypes)[number];
export const messageAudiences = ['STUDENT_AND_STAFF', 'STAFF_ONLY'] as const;
export type MessageAudience = (typeof messageAudiences)[number];

export interface CaseMessageItem {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  messageType: CaseMessageType;
  audience: MessageAudience;
  body: string;
  createdAt: string;
  inReplyToId: string | null;
}

export const escalationStates = [
  'FLAGGED',
  'IDENTIFYING_REVIEWER',
  'AWAITING_MANUAL',
  'REVIEWER_ASSIGNED',
  'UNDER_REVIEWER_HANDLING',
  'COMPLETED',
  'CANCELLED',
  'ESCALATED_FURTHER',
] as const;
export type EscalationState = (typeof escalationStates)[number];

export interface EscalationLevelItem {
  id: string;
  level: number;
  reasonType: string;
  reason: string;
  state: EscalationState;
  reviewerId: string | null;
  reviewerName: string | null;
  createdAt: string;
  reviewerAssignedAt: string | null;
}

export interface GrievanceSummary {
  id: string;
  caseNumber: string | null;
  title: string | null;
  categoryId: string | null;
  categoryName: string | null;
  incidentDate: string | null;
  status: GrievanceStatus;
  priority: GrievancePriority;
  submittedAt: string | null;
  resolutionDeadline: string | null;
  assignedHandlerName: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface GrievanceDetail extends GrievanceSummary {
  description: string | null;
  location: string | null;
  slaHoursSnapshot: number | null;
  slaPolicyVersion: number | null;
  evidence: GrievanceEvidence[];
  statusHistory: GrievanceStatusEvent[];
  messages: CaseMessageItem[];
  escalationLevels: EscalationLevelItem[];
}

export interface ReviewerQueueResponse {
  data: {
    items: Array<GrievanceSummary & { escalationLevel: EscalationLevelItem }>;
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface ManualReviewerAssignmentResponse {
  data: {
    items: Array<GrievanceSummary & { escalationLevel: EscalationLevelItem }>;
  };
}

export interface HandlerWorkloadResponse {
  data: {
    assigned: number;
    overdue: number;
    byStatus: Partial<Record<GrievanceStatus, number>>;
  };
}

export type GrievancePatch = Partial<
  Pick<
    GrievanceDetail,
    'title' | 'description' | 'categoryId' | 'incidentDate' | 'location' | 'priority'
  >
>;

export interface GrievanceListResponse {
  data: {
    items: GrievanceSummary[];
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface GrievanceDetailResponse {
  data: GrievanceDetail;
}

export interface GrievanceCategoryListResponse {
  data: { items: GrievanceCategoryOption[] };
}

export interface GrievanceWriteResponse {
  data: GrievanceDetail;
}

export interface EvidenceUploadResponse {
  data: {
    items: GrievanceEvidence[];
    rejectedFiles: Array<{ fileName: string; code: string; message: string }>;
  };
}

export interface HealthResponse {
  status: 'ok';
  service: 'sgrs-api';
  timestamp: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}
