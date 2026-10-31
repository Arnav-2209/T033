import type { PublicUser, UserRole } from '@sgrs/contracts';
import { hashPassword, isAcceptablePassword } from '../../../infrastructure/security/password.js';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import type {
  AccountRecord,
  AuthRepository,
  UserChanges,
  UserFilters,
} from '../../auth/application/ports.js';

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

function isPrismaError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export class UserService {
  constructor(private readonly repository: AuthRepository) {}

  async list(
    filters: UserFilters,
  ): Promise<{ items: PublicUser[]; page: number; pageSize: number; total: number }> {
    const result = await this.repository.listUsers(filters);
    return {
      items: result.users.map(safeUser),
      page: filters.page,
      pageSize: filters.pageSize,
      total: result.total,
    };
  }

  async create(input: {
    actorId: string;
    email: string;
    name: string;
    password: string;
    role: UserRole;
    departmentId?: string | null;
    contact?: string | null;
    requestId: string;
  }): Promise<PublicUser> {
    if (!isAcceptablePassword(input.password)) {
      throw new AppError(
        400,
        'INVALID_PASSWORD',
        'Initial password must be at least 12 characters and no more than 72 UTF-8 bytes.',
      );
    }

    try {
      const created = await this.repository.createUser({
        actorId: input.actorId,
        email: input.email.trim().toLowerCase(),
        name: input.name.trim(),
        passwordHash: await hashPassword(input.password),
        role: input.role,
        departmentId: input.departmentId ?? null,
        contact: input.contact?.trim() || null,
        requestId: input.requestId,
      });
      return safeUser(created);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new AppError(
          409,
          'EMAIL_ALREADY_EXISTS',
          'An account with this email already exists.',
        );
      }
      if (isPrismaError(error, 'P2003')) {
        throw new AppError(400, 'INVALID_DEPARTMENT', 'The selected department does not exist.');
      }
      throw error;
    }
  }

  async update(input: {
    actorId: string;
    targetUserId: string;
    changes: UserChanges;
    requestId: string;
  }): Promise<PublicUser> {
    if (Object.keys(input.changes).length === 0) {
      throw new AppError(400, 'EMPTY_UPDATE', 'Provide at least one user field to update.');
    }

    const changes = {
      ...input.changes,
      ...(input.changes.email === undefined
        ? {}
        : { email: input.changes.email.trim().toLowerCase() }),
      ...(input.changes.name === undefined ? {} : { name: input.changes.name.trim() }),
      ...(input.changes.contact === undefined || input.changes.contact === null
        ? {}
        : { contact: input.changes.contact.trim() || null }),
    };

    try {
      return safeUser(
        await this.repository.updateUser({
          actorId: input.actorId,
          targetUserId: input.targetUserId,
          changes,
          requestId: input.requestId,
        }),
      );
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new AppError(
          409,
          'EMAIL_ALREADY_EXISTS',
          'An account with this email already exists.',
        );
      }
      if (isPrismaError(error, 'P2003')) {
        throw new AppError(400, 'INVALID_DEPARTMENT', 'The selected department does not exist.');
      }
      throw error;
    }
  }
}
