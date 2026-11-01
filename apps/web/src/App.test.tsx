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
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

describe('authentication experience', () => {
  it('offers email and password authentication without a role selector', async () => {
    window.history.pushState({}, '', '/login');
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
    window.history.pushState({}, '', '/login');
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

    expect(
      await screen.findByRole('heading', { name: 'See the shape of resolution.' }),
    ).toBeTruthy();
    await waitFor(() => expect(window.location.pathname).toBe('/app/management'));
  });

  it('lets a demo account fill only the email field', async () => {
    window.history.pushState({}, '', '/login');
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

describe('public SGRS story', () => {
  it('presents the process, all five roles and one working sign-in path', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401),
    );
    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'A concern deserves a clear path forward.' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /sign in/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'From first report to considered response.' }),
    ).toBeTruthy();
    for (const role of [
      'Student',
      'Grievance handler',
      'Department reviewer',
      'Administrator',
      'Institute management',
    ]) {
      expect(screen.getByRole('heading', { name: role })).toBeTruthy();
    }
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveProperty(
      'href',
      expect.stringContaining('#main-content'),
    );
  });

  it('keeps chapters available with static state tracking when reduced motion is preferred', async () => {
    window.history.pushState({}, '', '/');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response({ error: { code: 'UNAUTHENTICATED', message: 'Sign in to continue.' } }, 401),
    );
    const observe = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = observe;
        disconnect() {}
      },
    );
    vi.stubGlobal('matchMedia', () => ({ matches: true }));

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: 'A concern deserves a clear path forward.' }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'One clear record.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'A considered route.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'A careful review.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'A visible outcome.' })).toBeTruthy();
    expect(observe).toHaveBeenCalledTimes(4);
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
    expect(screen.queryByRole('heading', { name: 'Saved drafts' })).toBeNull();
    expect(screen.queryByText('No drafts in progress')).toBeNull();
    expect(await screen.findByText('Your submitted cases will appear here')).toBeTruthy();
  });

  it('shows only drafts with saved content on the student dashboard', async () => {
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
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        response({
          data: { user: student, expiresAt: new Date(Date.now() + 60_000).toISOString() },
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: {
            items: [
              {
                id: 'empty-draft',
                status: 'DRAFT',
                title: null,
                hasDraftContent: false,
                caseNumber: null,
                categoryId: null,
                categoryName: null,
                incidentDate: null,
                priority: 'NORMAL',
                submittedAt: null,
                resolutionDeadline: null,
                assignedHandlerName: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                version: 1,
              },
              {
                id: 'saved-draft',
                status: 'DRAFT',
                title: 'Hostel water supply issue',
                hasDraftContent: true,
                caseNumber: null,
                categoryId: 'category-id',
                categoryName: 'Hostel/Infrastructure',
                incidentDate: '2026-10-30',
                priority: 'NORMAL',
                submittedAt: null,
                resolutionDeadline: null,
                assignedHandlerName: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                version: 1,
              },
            ],
            page: 1,
            pageSize: 100,
            total: 2,
          },
        }),
      );

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Saved drafts' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Hostel water supply issue' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Untitled draft' })).toBeNull();
    expect(screen.getByText('1 draft')).toBeTruthy();
  });

  it('does not create an empty draft just by opening the grievance form', async () => {
    window.history.pushState({}, '', '/app/student/grievances/new');
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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/session'))
        return response({
          data: { user: student, expiresAt: new Date(Date.now() + 60_000).toISOString() },
        });
      if (url.endsWith('/student/grievance-categories')) return response({ data: { items: [] } });
      return response({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404);
    });

    render(<App />);
    expect(await screen.findByLabelText(/Title/)).toBeTruthy();
    const draftCreates = fetchMock.mock.calls.filter(
      ([input, init]) => String(input).endsWith('/student/grievances') && init?.method === 'POST',
    );
    expect(draftCreates).toHaveLength(0);
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
