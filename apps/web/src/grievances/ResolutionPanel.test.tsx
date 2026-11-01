import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { GrievanceDetail } from '@sgrs/contracts';
import { ResolutionPanel } from './ResolutionPanel.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.cookie = 'sgrs_csrf=; Max-Age=0';
});

function caseRecord(overrides: Partial<GrievanceDetail> = {}): GrievanceDetail {
  return {
    id: 'case-id',
    caseNumber: 'SGRS-2026-000001',
    title: 'Hostel maintenance',
    hasDraftContent: true,
    categoryId: 'category-id',
    categoryName: 'Hostel',
    incidentDate: '2026-10-30',
    status: 'UNDER_REVIEW',
    priority: 'NORMAL',
    submittedAt: new Date().toISOString(),
    resolutionDeadline: new Date(Date.now() + 86_400_000).toISOString(),
    assignedHandlerName: 'Ramesh Kumar',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 2,
    description: 'A test grievance.',
    location: null,
    slaHoursSnapshot: 120,
    slaPolicyVersion: 1,
    evidence: [],
    statusHistory: [],
    messages: [],
    escalationLevels: [],
    resolutionCycles: [],
    ...overrides,
  };
}

function response(data: GrievanceDetail): Response {
  return { ok: true, status: 200, json: async () => ({ data }) } as Response;
}

describe('resolution panel', () => {
  it('allows an active handler to submit required resolution remarks', async () => {
    const resolved = caseRecord({
      status: 'RESOLVED',
      resolutionCycles: [
        {
          id: 'cycle-id',
          cycleNumber: 1,
          resolvedById: 'handler-id',
          resolvedByName: 'Ramesh Kumar',
          remarks: 'Repair completed.',
          resolvedAt: new Date().toISOString(),
          feedbackDeadline: new Date(Date.now() + 259_200_000).toISOString(),
          closedAt: null,
          reopenDeadline: null,
          isCurrent: true,
          feedback: null,
        },
      ],
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(resolved));
    const onUpdated = vi.fn();
    render(
      <ResolutionPanel
        grievance={caseRecord()}
        role="HANDLER"
        userId="handler-id"
        onUpdated={onUpdated}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Resolution remarks/), {
      target: { value: 'Repair completed.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Resolve grievance' }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(resolved));
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/handler/grievances/case-id/resolve');
  });

  it('lets the owning student submit feedback and does not expose reopening', async () => {
    const resolvedAt = new Date().toISOString();
    const current = caseRecord({
      status: 'RESOLVED',
      resolutionCycles: [
        {
          id: 'cycle-id',
          cycleNumber: 1,
          resolvedById: 'handler-id',
          resolvedByName: 'Ramesh Kumar',
          remarks: 'Repair completed.',
          resolvedAt,
          feedbackDeadline: new Date(Date.now() + 259_200_000).toISOString(),
          closedAt: null,
          reopenDeadline: null,
          isCurrent: true,
          feedback: null,
        },
      ],
    });
    const closed = caseRecord({ ...current, status: 'CLOSED' });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(closed));
    const onUpdated = vi.fn();
    render(
      <ResolutionPanel
        grievance={current}
        role="STUDENT"
        userId="student-id"
        onUpdated={onUpdated}
      />,
    );

    expect(screen.getByText(/Share feedback on this resolution/)).toBeTruthy();
    expect(screen.queryByText(/reopen/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Rating/), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/Comment/), {
      target: { value: 'The repair was completed.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit feedback and close case' }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(closed));
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/student/grievances/case-id/feedback');
  });
});
