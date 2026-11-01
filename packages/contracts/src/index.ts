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

export interface FeedbackItem {
  id: string;
  studentId: string;
  rating: number;
  comment: string | null;
  submittedAt: string;
}

export interface ResolutionCycleItem {
  id: string;
  cycleNumber: number;
  resolvedById: string;
  resolvedByName: string;
  remarks: string;
  resolvedAt: string;
  feedbackDeadline: string;
  closedAt: string | null;
  reopenDeadline: string | null;
  isCurrent: boolean;
  feedback: FeedbackItem | null;
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
  hasDraftContent: boolean;
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
  resolutionCycles: ResolutionCycleItem[];
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

export interface NotificationItem {
  id: string;
  grievanceId: string | null;
  type: string;
  title: string;
  body: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationListResponse {
  data: {
    items: NotificationItem[];
    page: number;
    pageSize: number;
    total: number;
    unreadCount: number;
  };
}

export interface CategoryAdminItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  slaHours: number;
  policyVersion: number;
  handlers: Array<{
    id: string;
    handlerId: string;
    handlerName: string;
    handlerEmail: string;
    isPrimary: boolean;
    activeFrom: string;
  }>;
  escalationRules: Array<{
    id: string;
    level: number;
    reviewerId: string | null;
    reviewerName: string | null;
    timelineHours: number | null;
    isActive: boolean;
  }>;
}

export interface CategoryAdminListResponse {
  data: { items: CategoryAdminItem[] };
}

export interface StaffDirectoryItem {
  id: string;
  name: string;
  email: string;
  role: Extract<UserRole, 'HANDLER' | 'REVIEWER'>;
  departmentName: string | null;
  isActive: boolean;
  categories: string[];
}

export interface StaffDirectoryResponse {
  data: { items: StaffDirectoryItem[] };
}

export interface AdminOverviewResponse {
  data: {
    totalCases: number;
    openCases: number;
    overdueCases: number;
    byStatus: Partial<Record<GrievanceStatus, number>>;
  };
}

export interface CategoryReportResponse {
  data: {
    from: string;
    to: string;
    items: Array<{
      categoryId: string | null;
      categoryName: string;
      total: number;
      byStatus: Partial<Record<GrievanceStatus, number>>;
    }>;
  };
}

export interface HandlerReportResponse {
  data: {
    from: string;
    to: string;
    items: Array<{
      handlerId: string;
      handlerName: string;
      activeAssignments: number;
      resolvedCount: number;
      averageHoursToFirstResolution: number | null;
    }>;
  };
}

export interface AuditEventItem {
  id: string;
  actorName: string | null;
  actorRole: UserRole | null;
  action: string;
  details: unknown;
  source: string;
  occurredAt: string;
  requestId: string | null;
}

export interface AuditTrailResponse {
  data: {
    items: AuditEventItem[];
    page: number;
    pageSize: number;
    total: number;
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
