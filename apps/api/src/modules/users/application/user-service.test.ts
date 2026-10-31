import { describe, expect, it, vi } from 'vitest';
import { UserService } from './user-service.js';
import type { AccountRecord, AuthRepository } from '../../auth/application/ports.js';

describe('UserService', () => {
  it('normalizes account identity, hashes the initial password, and omits the hash from responses', async () => {
    const createUser = vi.fn(
      async (input: Parameters<AuthRepository['createUser']>[0]) =>
        ({
          id: 'new-user-id',
          email: input.email,
          name: input.name,
          passwordHash: input.passwordHash,
          role: input.role,
          departmentId: input.departmentId,
          contact: input.contact,
          isActive: true,
          createdAt: new Date('2026-10-31T00:00:00.000Z'),
        }) satisfies AccountRecord,
    );
    const repository = { createUser } as unknown as AuthRepository;
    const service = new UserService(repository);

    const user = await service.create({
      actorId: 'admin-id',
      email: '  Test.User@Demo.SGRS.Local ',
      name: '  Demo User  ',
      password: 'PhaseTwo-Temp!2026',
      role: 'HANDLER',
      requestId: 'request-1',
    });

    expect(createUser).toHaveBeenCalledOnce();
    const firstCall = createUser.mock.calls.at(0);
    if (!firstCall) throw new Error('Expected a user provisioning call.');
    const createInput = firstCall[0];
    expect(createInput.email).toBe('test.user@demo.sgrs.local');
    expect(createInput.name).toBe('Demo User');
    expect(createInput.passwordHash).not.toBe('PhaseTwo-Temp!2026');
    expect(user).toMatchObject({ id: 'new-user-id', role: 'HANDLER', isActive: true });
    expect(user).not.toHaveProperty('passwordHash');
  });

  it('rejects weak initial passwords before writing an account', async () => {
    const createUser = vi.fn();
    const repository = { createUser } as unknown as AuthRepository;
    const service = new UserService(repository);

    await expect(
      service.create({
        actorId: 'admin-id',
        email: 'new.user@demo.sgrs.local',
        name: 'New User',
        password: 'too-short',
        role: 'STUDENT',
        requestId: 'request-2',
      }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PASSWORD' });
    expect(createUser).not.toHaveBeenCalled();
  });
});
