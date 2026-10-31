import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from './App.js';

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('authentication experience', () => {
  it('offers email and password authentication without a role selector', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401),
    );
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Welcome back.' })).toBeTruthy();
    expect(screen.getByLabelText('Email address')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.queryByLabelText('Role')).toBeNull();
    expect(screen.getByText(/No institute SSO is connected/i)).toBeTruthy();
  });

  it('redirects to the authenticated role home returned by the server', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        response({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            user: {
              id: 'management-id',
              email: 'management@demo.sgrs.local',
              name: 'Institute Management',
              role: 'MANAGEMENT',
              departmentId: null,
              contact: null,
              isActive: true,
              createdAt: new Date().toISOString(),
            },
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
        }),
      );

    render(<App />);
    await screen.findByRole('heading', { name: 'Welcome back.' });
    fireEvent.change(screen.getByLabelText('Email address'), {
      target: { value: 'management@demo.sgrs.local' },
    });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'demo password' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('heading', { name: 'Your SGRS desk.' })).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/app/management'));
  });

  it('lets a demo account fill only the email field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401),
    );
    render(<App />);
    await screen.findByRole('heading', { name: 'Welcome back.' });
    fireEvent.click(screen.getByText('Choose a demo account'));
    fireEvent.click(screen.getByRole('button', { name: /Administrator/ }));

    expect(screen.getByLabelText('Email address')).toHaveProperty('value', 'admin@demo.sgrs.local');
    expect(screen.getByLabelText('Password')).toHaveProperty('value', '');
  });
});

describe('student grievance workspace', () => {
  it('shows an owned case overview and a draft creation entry point', async () => {
    window.history.pushState({}, '', '/app/student');
    const student = {
      id: 'student-id',
      email: 'student@example.test',
      name: 'Aditi Rao',
      role: 'STUDENT',
      departmentId: null,
      contact: null,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock
      .mockResolvedValueOnce(
        response({
          data: { user: student, expiresAt: new Date(Date.now() + 60_000).toISOString() },
        }),
      )
      .mockResolvedValueOnce(response({ data: { items: [], page: 1, pageSize: 100, total: 0 } }));

    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Your concerns, clearly tracked.' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /Start a grievance/ })).toBeTruthy();
    expect(await screen.findByText('No drafts in progress')).toBeTruthy();
    expect(await screen.findByText('Your submitted cases will appear here')).toBeTruthy();
  });
});

describe('Phase 4 staff workspaces', () => {
  const user = (role: 'HANDLER' | 'REVIEWER') => ({
    id: `${role.toLowerCase()}-id`,
    email: `${role.toLowerCase()}@example.test`,
    name: 'Staff member',
    role,
    departmentId: null,
    contact: null,
    isActive: true,
    createdAt: new Date().toISOString(),
  });

  it('loads handler workload and exposes queue search, status and SLA sorting', async () => {
    window.history.pushState({}, '', '/app/handler');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/session'))
        return response({
          data: { user: user('HANDLER'), expiresAt: new Date(Date.now() + 60_000).toISOString() },
        });
      if (url.includes('/handler/workload'))
        return response({ data: { assigned: 2, overdue: 1, byStatus: { UNDER_REVIEW: 2 } } });
      if (url.includes('/grievances?'))
        return response({ data: { items: [], page: 1, pageSize: 100, total: 0 } });
      return response({ data: { user: null } }, 401);
    });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'The cases routed to you.' })).toBeTruthy();
    expect(await screen.findByText('Active assignments')).toBeTruthy();
    expect(screen.getByLabelText('Search assigned cases')).toBeTruthy();
    expect(screen.getByLabelText('Status')).toBeTruthy();
    expect(screen.getByLabelText('Sort by')).toBeTruthy();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/handler/workload'))).toBe(
        true,
      ),
    );
  });

  it('shows only the reviewer escalations queue for reviewer accounts', async () => {
    window.history.pushState({}, '', '/app/reviewer');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/session'))
        return response({
          data: { user: user('REVIEWER'), expiresAt: new Date(Date.now() + 60_000).toISOString() },
        });
      if (url.includes('/reviewer/escalations'))
        return response({ data: { items: [], page: 1, pageSize: 50, total: 0 } });
      return response({ data: { user: null } }, 401);
    });
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Cases requiring your review.' }),
    ).toBeTruthy();
    expect(await screen.findByText('No assigned escalations')).toBeTruthy();
    expect(screen.getByLabelText('Search escalations')).toBeTruthy();
  });
});
