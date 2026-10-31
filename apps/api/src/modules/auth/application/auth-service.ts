import { randomBytes } from 'node:crypto';
import type { PublicUser, UserRole } from '@sgrs/contracts';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import {
  hashPassword,
  isAcceptablePassword,
  MAX_PASSWORD_BYTES,
  verifyPassword,
} from '../../../infrastructure/security/password.js';
import {
  createOpaqueToken,
  hashMetadata,
  hashToken,
  tokenMatchesHash,
} from '../../../infrastructure/security/session-token.js';
import type { AccountRecord, AuthRepository, SessionRecord } from './ports.js';

export interface AuthenticatedActor {
  userId: string;
  sessionId: string;
  email: string;
  name: string;
  role: UserRole;
  departmentId: string | null;
  contact: string | null;
  isActive: boolean;
  createdAt: Date;
  csrfHash: Uint8Array;
  lastSeenAt: Date;
  expiresAt: Date;
}

export interface IssuedSession {
  user: PublicUser;
  expiresAt: Date;
  sessionToken: string;
  csrfToken: string;
}

export interface SessionPolicy {
  idleTimeoutMinutes: number;
  absoluteTimeoutHours: number;
}

function safeUser(account: AccountRecord): PublicUser {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    role: account.role,
    departmentId: account.departmentId,
    contact: account.contact,
    isActive: account.isActive,
    createdAt: account.createdAt.toISOString(),
  };
}

function toActor(session: SessionRecord): AuthenticatedActor {
  return {
    userId: session.user.id,
    sessionId: session.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    departmentId: session.user.departmentId,
    contact: session.user.contact,
    isActive: session.user.isActive,
    createdAt: session.user.createdAt,
    csrfHash: session.csrfHash,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
  };
}

export class AuthService {
  private readonly dummyPasswordHash = hashPassword(randomBytes(32).toString('hex'));

  constructor(
    private readonly repository: AuthRepository,
    private readonly policy: SessionPolicy,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async login(input: {
    email: string;
    password: string;
    userAgent?: string;
    requestId: string;
  }): Promise<IssuedSession> {
    const email = input.email.trim().toLowerCase();
    const account = await this.repository.findAccountByEmail(email);
    const tooLong = Buffer.byteLength(input.password, 'utf8') > MAX_PASSWORD_BYTES;
    const passwordHash = account && !tooLong ? account.passwordHash : await this.dummyPasswordHash;
    const passwordValid = await verifyPassword(input.password, passwordHash);

    if (!account || !account.isActive || tooLong || !passwordValid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
    }

    return this.issueSession(account, input.userAgent, input.requestId);
  }

  async authenticate(
    sessionToken: string | undefined,
    requestId: string,
  ): Promise<AuthenticatedActor | null> {
    if (!sessionToken || sessionToken.length > 128) return null;
    const session = await this.repository.findSessionByTokenHash(hashToken(sessionToken));
    if (!session || session.revokedAt) return null;

    const now = this.now();
    const idleDeadline = session.lastSeenAt.getTime() + this.policy.idleTimeoutMinutes * 60_000;
    if (
      !session.user.isActive ||
      session.expiresAt.getTime() <= now.getTime() ||
      idleDeadline <= now.getTime()
    ) {
      await this.repository.revokeSession(session.id, session.userId, requestId, now);
      return null;
    }

    await this.repository.touchSession(session.id, now);
    return toActor({ ...session, lastSeenAt: now });
  }

  async logout(actor: AuthenticatedActor, requestId: string): Promise<void> {
    await this.repository.revokeSession(actor.sessionId, actor.userId, requestId, this.now());
  }

  async logoutAll(actor: AuthenticatedActor, requestId: string): Promise<number> {
    return this.repository.revokeAllSessions(actor.userId, actor.userId, requestId, this.now());
  }

  async changePassword(input: {
    actor: AuthenticatedActor;
    currentPassword: string;
    newPassword: string;
    userAgent?: string;
    requestId: string;
  }): Promise<IssuedSession> {
    const account = await this.repository.findAccountByEmail(input.actor.email);
    const currentPasswordTooLong =
      Buffer.byteLength(input.currentPassword, 'utf8') > MAX_PASSWORD_BYTES;
    const passwordValid = account
      ? await verifyPassword(
          input.currentPassword,
          currentPasswordTooLong ? await this.dummyPasswordHash : account.passwordHash,
        )
      : await verifyPassword(input.currentPassword, await this.dummyPasswordHash);
    if (!account || !account.isActive || currentPasswordTooLong || !passwordValid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Current password is incorrect.');
    }
    if (!isAcceptablePassword(input.newPassword)) {
      throw new AppError(
        400,
        'INVALID_PASSWORD',
        'Password must be at least 12 characters and no more than 72 UTF-8 bytes.',
      );
    }

    const sessionToken = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.policy.absoluteTimeoutHours * 3_600_000);
    await this.repository.changePasswordAndRotateSession({
      actorId: input.actor.userId,
      currentSessionId: input.actor.sessionId,
      passwordHash: await hashPassword(input.newPassword),
      tokenHash: hashToken(sessionToken),
      csrfHash: hashToken(csrfToken),
      userAgentHash: hashMetadata(input.userAgent),
      expiresAt,
      requestId: input.requestId,
      at: now,
    });

    return { user: safeUser(account), expiresAt, sessionToken, csrfToken };
  }

  private async issueSession(
    account: AccountRecord,
    userAgent: string | undefined,
    requestId: string,
  ): Promise<IssuedSession> {
    const sessionToken = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    const now = this.now();
    const expiresAt = new Date(now.getTime() + this.policy.absoluteTimeoutHours * 3_600_000);

    await this.repository.createSession({
      userId: account.id,
      tokenHash: hashToken(sessionToken),
      csrfHash: hashToken(csrfToken),
      userAgentHash: hashMetadata(userAgent),
      expiresAt,
      requestId,
    });

    return { user: safeUser(account), expiresAt, sessionToken, csrfToken };
  }

  csrfMatches(actor: AuthenticatedActor, csrfToken: string | undefined): boolean {
    return Boolean(csrfToken && tokenMatchesHash(csrfToken, actor.csrfHash));
  }
}
