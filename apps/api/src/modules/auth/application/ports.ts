import type { UserRole } from '@sgrs/contracts';

export interface AccountRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: UserRole;
  departmentId: string | null;
  contact: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface SessionRecord {
  id: string;
  userId: string;
  csrfHash: Uint8Array;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  user: AccountRecord;
}

export interface UserFilters {
  query?: string;
  role?: UserRole;
  isActive?: boolean;
  page: number;
  pageSize: number;
}

export interface UserChanges {
  email?: string;
  name?: string;
  role?: UserRole;
  departmentId?: string | null;
  contact?: string | null;
  isActive?: boolean;
}

export interface AuthRepository {
  findAccountByEmail(email: string): Promise<AccountRecord | null>;
  createSession(input: {
    userId: string;
    tokenHash: Uint8Array;
    csrfHash: Uint8Array;
    userAgentHash: Uint8Array | null;
    expiresAt: Date;
    requestId: string;
  }): Promise<void>;
  findSessionByTokenHash(tokenHash: Uint8Array): Promise<SessionRecord | null>;
  touchSession(sessionId: string, at: Date): Promise<void>;
  revokeSession(sessionId: string, actorId: string, requestId: string, at: Date): Promise<void>;
  revokeAllSessions(userId: string, actorId: string, requestId: string, at: Date): Promise<number>;
  changePasswordAndRotateSession(input: {
    actorId: string;
    currentSessionId: string;
    passwordHash: string;
    tokenHash: Uint8Array;
    csrfHash: Uint8Array;
    userAgentHash: Uint8Array | null;
    expiresAt: Date;
    requestId: string;
    at: Date;
  }): Promise<void>;
  listUsers(filters: UserFilters): Promise<{ users: AccountRecord[]; total: number }>;
  createUser(input: {
    actorId: string;
    email: string;
    name: string;
    passwordHash: string;
    role: UserRole;
    departmentId: string | null;
    contact: string | null;
    requestId: string;
  }): Promise<AccountRecord>;
  updateUser(input: {
    actorId: string;
    targetUserId: string;
    changes: UserChanges;
    requestId: string;
  }): Promise<AccountRecord>;
}
