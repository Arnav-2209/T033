import type {
  Prisma,
  PrismaClient,
  UserRole as DbUserRole,
} from '../../generated/prisma/client.js';
import type {
  AccountRecord,
  AuthRepository,
  SessionRecord,
  UserChanges,
  UserFilters,
} from '../../modules/auth/application/ports.js';
import { AppError } from '../errors/app-error.js';

function toAccount(record: {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: DbUserRole;
  departmentId: string | null;
  contact: string | null;
  isActive: boolean;
  createdAt: Date;
}): AccountRecord {
  return record;
}

function audit(
  actorId: string,
  action: string,
  entityId: string,
  requestId: string,
  details: Prisma.InputJsonObject,
) {
  return {
    actorId,
    entityType: 'USER',
    entityId,
    action,
    details,
    requestId,
    source: 'API' as const,
  };
}

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findAccountByEmail(email: string): Promise<AccountRecord | null> {
    const account = await this.prisma.user.findUnique({ where: { email } });
    return account ? toAccount(account) : null;
  }

  async createSession(input: {
    userId: string;
    tokenHash: Uint8Array;
    csrfHash: Uint8Array;
    userAgentHash: Uint8Array | null;
    expiresAt: Date;
    requestId: string;
  }): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM users WHERE id = ${input.userId}::uuid AND is_active = true FOR UPDATE`;
      const activeAccount = await transaction.user.findFirst({
        where: { id: input.userId, isActive: true },
        select: { id: true },
      });
      if (!activeAccount) {
        throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
      }
      const session = await transaction.session.create({
        data: {
          userId: input.userId,
          tokenHash: Buffer.from(input.tokenHash),
          csrfHash: Buffer.from(input.csrfHash),
          userAgentHash: input.userAgentHash ? Buffer.from(input.userAgentHash) : null,
          expiresAt: input.expiresAt,
        },
      });
      await transaction.user.update({ where: { id: input.userId }, data: { lastLoginAt: now } });
      await transaction.auditLog.create({
        data: audit(input.userId, 'AUTH_LOGIN', input.userId, input.requestId, {
          sessionId: session.id,
        }),
      });
    });
  }

  async findSessionByTokenHash(tokenHash: Uint8Array): Promise<SessionRecord | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: Buffer.from(tokenHash) },
      include: { user: true },
    });
    if (!session) return null;
    return {
      id: session.id,
      userId: session.userId,
      csrfHash: session.csrfHash,
      lastSeenAt: session.lastSeenAt,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      user: toAccount(session.user),
    };
  }

  async touchSession(sessionId: string, at: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { lastSeenAt: at },
    });
  }

  async revokeSession(
    sessionId: string,
    actorId: string,
    requestId: string,
    at: Date,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: at },
      });
      if (result.count > 0) {
        await transaction.auditLog.create({
          data: audit(actorId, 'AUTH_SESSION_REVOKED', actorId, requestId, { sessionId }),
        });
      }
    });
  }

  async revokeAllSessions(
    userId: string,
    actorId: string,
    requestId: string,
    at: Date,
  ): Promise<number> {
    return this.prisma.$transaction(async (transaction) => {
      const result = await transaction.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: at },
      });
      await transaction.auditLog.create({
        data: audit(actorId, 'AUTH_LOGOUT_ALL', userId, requestId, { revokedCount: result.count }),
      });
      return result.count;
    });
  }

  async changePasswordAndRotateSession(input: {
    actorId: string;
    currentSessionId: string;
    passwordHash: string;
    tokenHash: Uint8Array;
    csrfHash: Uint8Array;
    userAgentHash: Uint8Array | null;
    expiresAt: Date;
    requestId: string;
    at: Date;
  }): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM users WHERE id = ${input.actorId}::uuid FOR UPDATE`;
      const currentAccount = await transaction.user.findUnique({
        where: { id: input.actorId },
        select: { isActive: true },
      });
      if (!currentAccount?.isActive) {
        throw new AppError(
          401,
          'UNAUTHENTICATED',
          'Your session has expired. Please sign in again.',
        );
      }
      const current = await transaction.session.updateMany({
        where: {
          id: input.currentSessionId,
          userId: input.actorId,
          revokedAt: null,
          expiresAt: { gt: input.at },
        },
        data: { revokedAt: input.at },
      });
      if (current.count !== 1) {
        throw new AppError(
          401,
          'UNAUTHENTICATED',
          'Your session has expired. Please sign in again.',
        );
      }

      await transaction.user.update({
        where: { id: input.actorId },
        data: { passwordHash: input.passwordHash },
      });
      await transaction.session.updateMany({
        where: { userId: input.actorId, revokedAt: null },
        data: { revokedAt: input.at },
      });
      await transaction.session.create({
        data: {
          userId: input.actorId,
          tokenHash: Buffer.from(input.tokenHash),
          csrfHash: Buffer.from(input.csrfHash),
          userAgentHash: input.userAgentHash ? Buffer.from(input.userAgentHash) : null,
          expiresAt: input.expiresAt,
          lastSeenAt: input.at,
        },
      });
      await transaction.auditLog.create({
        data: audit(input.actorId, 'AUTH_PASSWORD_CHANGED', input.actorId, input.requestId, {}),
      });
    });
  }

  async listUsers(filters: UserFilters): Promise<{ users: AccountRecord[]; total: number }> {
    const where: Prisma.UserWhereInput = {
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.isActive === undefined ? {} : { isActive: filters.isActive }),
      ...(filters.query
        ? {
            OR: [
              { email: { contains: filters.query, mode: 'insensitive' } },
              { name: { contains: filters.query, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: [{ name: 'asc' }, { email: 'asc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { users: users.map(toAccount), total };
  }

  async createUser(input: {
    actorId: string;
    email: string;
    name: string;
    passwordHash: string;
    role: DbUserRole;
    departmentId: string | null;
    contact: string | null;
    requestId: string;
  }): Promise<AccountRecord> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT (pg_advisory_xact_lock(164012) IS NULL) AS locked`;
      await this.assertAdministrator(transaction, input.actorId);
      const account = await transaction.user.create({
        data: {
          email: input.email,
          name: input.name,
          passwordHash: input.passwordHash,
          role: input.role,
          departmentId: input.departmentId,
          contact: input.contact,
        },
      });
      await transaction.auditLog.create({
        data: audit(input.actorId, 'ADMIN_USER_CREATED', account.id, input.requestId, {
          email: account.email,
          role: account.role,
        }),
      });
      return toAccount(account);
    });
  }

  async updateUser(input: {
    actorId: string;
    targetUserId: string;
    changes: UserChanges;
    requestId: string;
  }): Promise<AccountRecord> {
    return this.prisma.$transaction(async (transaction) => {
      // Serialize administrator account mutations to prevent concurrent lockout.
      await transaction.$queryRaw`SELECT (pg_advisory_xact_lock(164012) IS NULL) AS locked`;
      await this.assertAdministrator(transaction, input.actorId);
      await transaction.$queryRaw`SELECT id FROM users WHERE id = ${input.targetUserId}::uuid FOR UPDATE`;
      const current = await transaction.user.findUnique({ where: { id: input.targetUserId } });
      if (!current) throw new AppError(404, 'USER_NOT_FOUND', 'User was not found.');

      const nextRole = input.changes.role ?? current.role;
      const nextActive = input.changes.isActive ?? current.isActive;
      if (
        current.role === 'ADMINISTRATOR' &&
        current.isActive &&
        (nextRole !== 'ADMINISTRATOR' || !nextActive)
      ) {
        const activeAdministrators = await transaction.user.count({
          where: { role: 'ADMINISTRATOR', isActive: true },
        });
        if (activeAdministrators <= 1) {
          throw new AppError(
            409,
            'LAST_ADMINISTRATOR',
            'At least one active administrator account must remain.',
          );
        }
      }

      const updated = await transaction.user.update({
        where: { id: current.id },
        data: input.changes,
      });
      const changedFields = Object.keys(input.changes).filter(
        (field) =>
          input.changes[field as keyof UserChanges] !== current[field as keyof typeof current],
      );

      if (changedFields.length > 0) {
        const revokesSessions =
          changedFields.includes('role') ||
          changedFields.includes('email') ||
          (changedFields.includes('isActive') && !updated.isActive);
        if (revokesSessions) {
          const revoked = await transaction.session.updateMany({
            where: { userId: current.id, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          if (revoked.count > 0) {
            await transaction.auditLog.create({
              data: audit(
                input.actorId,
                'ADMIN_USER_SESSIONS_REVOKED',
                current.id,
                input.requestId,
                {
                  revokedCount: revoked.count,
                },
              ),
            });
          }
        }
        await transaction.auditLog.create({
          data: audit(input.actorId, 'ADMIN_USER_UPDATED', current.id, input.requestId, {
            changedFields,
            before: { email: current.email, role: current.role, isActive: current.isActive },
            after: { email: updated.email, role: updated.role, isActive: updated.isActive },
          }),
        });
      }

      return toAccount(updated);
    });
  }

  private async assertAdministrator(
    transaction: Prisma.TransactionClient,
    actorId: string,
  ): Promise<void> {
    const actor = await transaction.user.findUnique({
      where: { id: actorId },
      select: { role: true, isActive: true },
    });
    if (!actor?.isActive || actor.role !== 'ADMINISTRATOR') {
      throw new AppError(403, 'FORBIDDEN', 'Administrator access is required.');
    }
  }
}
