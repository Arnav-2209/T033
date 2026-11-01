import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from '../App.js';
import { AuditTrailPanel } from '../administration/AuditTrailPanel.js';

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function session(role: 'STUDENT' | 'ADMINISTRATOR' | 'MANAGEMENT') {
  return {
    data: {
      user: {
        id: `${role.toLowerCase()}-id`,
        email: `${role.toLowerCase()}@example.test`,
        name: role === 'MANAGEMENT' ? 'Institute Management' : 'SGRS User',
        role,
        departmentId: null,
        contact: null,
        isActive: true,
        createdAt: new Date().toISOString(),
      },
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.cookie = 'sgrs_csrf=; Max-Age=0';
});

describe('Phase 6 administration interfaces', () => {
  it('keeps management reports aggregate-only and hides case notifications', async () => {
    window.history.pushState({}, '', '/app/management/reports');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/session')) return response(session('MANAGEMENT'));
      if (url.endsWith('/management/reports/overview')) {
        return response({
          data: { totalCases: 12, openCases: 4, overdueCases: 1, byStatus: { UNDER_REVIEW: 4 } },
        });
      }
      if (url.includes('/management/reports/categories')) {
        return response({
          data: {
            from: '2026-01-01T00:00:00.000Z',
            to: '2026-02-01T00:00:00.000Z',
            items: [
              {
                categoryId: 'category-id',
                categoryName: 'Hostel',
                total: 3,
                byStatus: { CLOSED: 3 },
              },
            ],
          },
        });
      }
      return response({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
    });

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Institutional overview.' })).toBeTruthy();
    expect(await screen.findByText('Hostel')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Notifications' })).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/reports/handlers'))).toBe(
      false,
    );
  });

  it('searches the staff directory through the administrative API', async () => {
    window.history.pushState({}, '', '/app/admin/categories');
    const handler = {
      id: 'handler-id',
      name: 'Ramesh Kumar',
      email: 'ramesh@example.test',
      role: 'HANDLER',
      departmentName: 'Hostel Affairs',
      isActive: true,
      categories: ['Hostel'],
    };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/auth/session')) return response(session('ADMINISTRATOR'));
      if (url.endsWith('/admin/categories')) return response({ data: { items: [] } });
      if (url.endsWith('/admin/directory?q=Ramesh')) {
        return response({ data: { items: [handler] } });
      }
      if (url.endsWith('/admin/directory')) return response({ data: { items: [] } });
      return response({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
    });

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Handlers and reviewers' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search staff by name or email'), {
      target: { value: 'Ramesh' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Search staff' }));

    expect(await screen.findByText('Ramesh Kumar')).toBeTruthy();
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).endsWith('/admin/directory?q=Ramesh')),
      ).toBe(true),
    );
  });

  it('lets a recipient mark an in-app notification read', async () => {
    window.history.pushState({}, '', '/app/notifications');
    document.cookie = 'sgrs_csrf=test-csrf';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/session')) return response(session('STUDENT'));
      if (url.includes('/notifications?')) {
        return response({
          data: {
            items: [
              {
                id: 'notification-id',
                grievanceId: null,
                type: 'STATUS_CHANGE',
                title: 'A case update',
                body: 'Your case status changed.',
                createdAt: new Date().toISOString(),
                readAt: null,
              },
            ],
            page: 1,
            pageSize: 25,
            total: 1,
            unreadCount: 1,
          },
        });
      }
      if (url.endsWith('/notifications/notification-id/read') && init?.method === 'PATCH') {
        return response(null, 204);
      }
      return response({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
    });

    render(<App />);
    expect(await screen.findByRole('heading', { name: 'A case update' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Mark as read' })).toBeNull());
    const markReadCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/notifications/notification-id/read'),
    );
    expect(new Headers(markReadCall?.[1]?.headers).get('x-csrf-token')).toBe('test-csrf');
  });

  it('paginates the administrator audit trail', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input), 'http://localhost');
      const page = Number(url.searchParams.get('page'));
      return response({
        data: {
          page,
          pageSize: 25,
          total: 30,
          items: [
            {
              id: `audit-${page}`,
              actorName: 'System Administrator',
              actorRole: 'ADMINISTRATOR',
              action: page === 1 ? 'FIRST_EVENT' : 'LATER_EVENT',
              details: {},
              source: 'ADMIN',
              occurredAt: new Date().toISOString(),
              requestId: null,
            },
          ],
        },
      });
    });
    render(<AuditTrailPanel grievanceId="grievance-id" />);
    expect(await screen.findByText('FIRST EVENT')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'More events' }));
    expect(await screen.findByText('LATER EVENT')).toBeTruthy();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('page=2'))).toBe(true),
    );
  });
});
