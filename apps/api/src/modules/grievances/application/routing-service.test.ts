import { describe, expect, it } from 'vitest';
import { RoutingService } from './routing-service.js';
import type { SubmissionContext } from './ports.js';

const at = new Date('2026-10-31T10:00:00.000Z');
const context: SubmissionContext = {
  grievanceId: 'grievance-1',
  studentId: 'student-1',
  status: 'DRAFT',
  version: 2,
  fields: {
    title: 'title',
    description: 'details',
    categoryId: 'category-1',
    incidentDate: '2026-10-30',
    location: null,
    priority: 'NORMAL',
  },
  category: {
    id: 'category-1',
    name: 'Facilities',
    isActive: true,
    slaHours: 120,
    policyVersion: 3,
    primaryHandlers: [
      {
        handlerId: 'inactive',
        name: 'Inactive',
        role: 'HANDLER',
        isActive: false,
        activeFrom: new Date('2026-01-01'),
        activeTo: null,
      },
      {
        handlerId: 'reviewer',
        name: 'Reviewer',
        role: 'REVIEWER',
        isActive: true,
        activeFrom: new Date('2026-01-01'),
        activeTo: null,
      },
      {
        handlerId: 'not-yet',
        name: 'Future mapping',
        role: 'HANDLER',
        isActive: true,
        activeFrom: new Date('2026-11-01'),
        activeTo: null,
      },
      {
        handlerId: 'eligible',
        name: 'Eligible',
        role: 'HANDLER',
        isActive: true,
        activeFrom: new Date('2026-01-01'),
        activeTo: null,
      },
    ],
  },
};

describe('RoutingService', () => {
  it('selects the eligible category handler and freezes the category SLA policy', () => {
    expect(new RoutingService().plan(context, at)).toEqual({
      handlerId: 'eligible',
      slaHours: 120,
      policyVersion: 3,
      resolutionDeadline: new Date('2026-11-05T10:00:00.000Z'),
      at,
    });
  });

  it('returns manual assignment when no handler is currently eligible', () => {
    const category = context.category;
    if (!category) throw new Error('Test category is required.');
    expect(
      new RoutingService().plan({ ...context, category: { ...category, primaryHandlers: [] } }, at)
        .handlerId,
    ).toBeNull();
  });
});
