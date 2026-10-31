import type {
  AuthSessionResponse,
  EvidenceUploadResponse,
  GrievanceCategoryListResponse,
  GrievanceDetailResponse,
  GrievanceListResponse,
  GrievancePatch,
  GrievanceStatus,
  GrievanceWriteResponse,
  PublicUser,
  UserListResponse,
  HandlerWorkloadResponse,
  ReviewerQueueResponse,
  ManualReviewerAssignmentResponse,
} from '@sgrs/contracts';

const API_PREFIX = '/api/v1';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

function readCookie(name: string): string | undefined {
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie.split('; ').find((cookie) => cookie.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : undefined;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { csrf?: boolean } = {},
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (init.body && !isFormData && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  headers.set('accept', 'application/json');

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && options.csrf !== false) {
    const csrf = readCookie('sgrs_csrf') ?? readCookie('__Host-sgrs_csrf');
    if (csrf) headers.set('x-csrf-token', csrf);
  }

  const response = await fetch(`${API_PREFIX}${path}`, {
    ...init,
    method,
    headers,
    credentials: 'include',
  });
  if (response.status === 204) return undefined as T;

  const body = (await response.json().catch(() => null)) as
    { error?: { code?: string; message?: string; details?: unknown } } | T | null;
  if (!response.ok) {
    const errorBody = body as {
      error?: { code?: string; message?: string; details?: unknown };
    } | null;
    throw new ApiClientError(
      response.status,
      errorBody?.error?.code ?? 'REQUEST_FAILED',
      errorBody?.error?.message ?? 'The request could not be completed.',
      errorBody?.error?.details,
    );
  }
  return body as T;
}

export const api = {
  listGrievances(
    input: {
      page?: number;
      pageSize?: number;
      status?: GrievanceStatus;
      q?: string;
      sort?: 'updated' | 'deadline' | 'status';
    } = {},
  ): Promise<GrievanceListResponse> {
    const params = new URLSearchParams({
      page: String(input.page ?? 1),
      pageSize: String(input.pageSize ?? 100),
    });
    if (input.status) params.set('status', input.status);
    if (input.q) params.set('q', input.q);
    if (input.sort) params.set('sort', input.sort);
    return request('/grievances?' + params.toString());
  },
  handlerWorkload(): Promise<HandlerWorkloadResponse> {
    return request('/handler/workload');
  },
  reviewerQueue(
    input: { page?: number; pageSize?: number; q?: string } = {},
  ): Promise<ReviewerQueueResponse> {
    const params = new URLSearchParams({
      page: String(input.page ?? 1),
      pageSize: String(input.pageSize ?? 50),
    });
    if (input.q) params.set('q', input.q);
    return request(`/reviewer/escalations?${params.toString()}`);
  },
  startHandlerReview(id: string): Promise<GrievanceDetailResponse> {
    return request(`/handler/grievances/${id}/start-review`, { method: 'POST', body: '{}' });
  },
  addHandlerNote(id: string, body: string): Promise<GrievanceDetailResponse> {
    return request(`/handler/grievances/${id}/internal-notes`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  },
  requestInformation(id: string, body: string): Promise<GrievanceDetailResponse> {
    return request(`/handler/grievances/${id}/information-requests`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  },
  respondToInformation(
    id: string,
    requestId: string,
    body: string,
  ): Promise<GrievanceDetailResponse> {
    return request(`/student/grievances/${id}/information-requests/${requestId}/responses`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  },
  escalate(id: string, reason: string): Promise<GrievanceDetailResponse> {
    return request(`/handler/grievances/${id}/escalations`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
  startReviewerHandling(id: string, level: number): Promise<GrievanceDetailResponse> {
    return request(`/reviewer/grievances/${id}/escalations/${level}/start`, {
      method: 'POST',
      body: '{}',
    });
  },
  addReviewerDirection(id: string, body: string): Promise<GrievanceDetailResponse> {
    return request(`/reviewer/grievances/${id}/directions`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  },
  escalateFurther(id: string, reason: string): Promise<GrievanceDetailResponse> {
    return request(`/reviewer/grievances/${id}/escalations`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
  manualAssignments(): Promise<ManualReviewerAssignmentResponse> {
    return request('/admin/escalations/manual-assignment');
  },
  reviewers(): Promise<{ data: { items: Array<{ id: string; name: string; email: string }> } }> {
    return request('/admin/reviewers');
  },
  assignReviewer(escalationId: string, reviewerId: string): Promise<void> {
    return request(`/admin/escalations/${escalationId}/reviewer`, {
      method: 'PATCH',
      body: JSON.stringify({ reviewerId }),
    });
  },
  listCategories(): Promise<GrievanceCategoryListResponse> {
    return request('/student/grievance-categories');
  },
  getGrievance(id: string): Promise<GrievanceDetailResponse> {
    return request('/grievances/' + encodeURIComponent(id));
  },
  createGrievanceDraft(): Promise<GrievanceWriteResponse> {
    return request('/student/grievances', { method: 'POST', body: '{}' });
  },
  updateGrievanceDraft(
    id: string,
    version: number,
    patch: GrievancePatch,
  ): Promise<GrievanceWriteResponse> {
    return request('/student/grievances/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({ version, ...patch }),
    });
  },
  submitGrievanceDraft(id: string, idempotencyKey: string): Promise<GrievanceWriteResponse> {
    return request('/student/grievances/' + encodeURIComponent(id) + '/submit', {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey },
      body: '{}',
    });
  },
  withdrawGrievance(id: string): Promise<GrievanceWriteResponse> {
    return request('/student/grievances/' + encodeURIComponent(id) + '/withdraw', {
      method: 'POST',
      body: '{}',
    });
  },
  uploadEvidence(id: string, files: File[]): Promise<EvidenceUploadResponse> {
    const form = new FormData();
    for (const file of files) form.append('evidence', file, file.name);
    return request('/student/grievances/' + encodeURIComponent(id) + '/evidence', {
      method: 'POST',
      body: form,
    });
  },
  evidenceUrl(grievanceId: string, evidenceId: string): string {
    return (
      '/api/v1/grievances/' +
      encodeURIComponent(grievanceId) +
      '/evidence/' +
      encodeURIComponent(evidenceId)
    );
  },
  login(email: string, password: string): Promise<AuthSessionResponse> {
    return request(
      '/auth/login',
      { method: 'POST', body: JSON.stringify({ email, password }) },
      { csrf: false },
    );
  },
  session(): Promise<AuthSessionResponse> {
    return request('/auth/session');
  },
  logout(): Promise<void> {
    return request('/auth/logout', { method: 'POST' });
  },
  logoutAll(): Promise<{ data: { revokedCount: number } }> {
    return request('/auth/logout-all', { method: 'POST' });
  },
  changePassword(currentPassword: string, newPassword: string): Promise<AuthSessionResponse> {
    return request('/auth/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },
  listUsers(query: string): Promise<UserListResponse> {
    const params = new URLSearchParams({ page: '1', pageSize: '100' });
    if (query.trim()) params.set('q', query.trim());
    return request(`/admin/users?${params.toString()}`);
  },
  createUser(input: {
    email: string;
    name: string;
    initialPassword: string;
    role: PublicUser['role'];
    departmentId?: string;
    contact?: string;
  }): Promise<{ data: PublicUser }> {
    return request('/admin/users', { method: 'POST', body: JSON.stringify(input) });
  },
  updateUser(
    id: string,
    changes: Partial<
      Pick<PublicUser, 'email' | 'name' | 'role' | 'departmentId' | 'contact' | 'isActive'>
    >,
  ): Promise<{ data: PublicUser }> {
    return request(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(changes) });
  },
};
