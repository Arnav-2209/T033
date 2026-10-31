import { describe, expect, it } from 'vitest';
import { validateDraftPatch, validateSubmission } from './validation.js';

const today = new Date('2026-10-31T07:00:00.000Z');
const valid = {
  title: 'Water leak in corridor',
  description: 'A leak has been present since yesterday.',
  categoryId: '44e9c5c0-a8be-40d6-9d16-ded51003b0f4',
  incidentDate: '2026-10-31',
  location: null,
  priority: 'NORMAL' as const,
};

describe('grievance submission validation', () => {
  it('accepts the institution-local current date and an optional location', () => {
    expect(() => validateSubmission(valid, true, today, 'Asia/Kolkata')).not.toThrow();
  });

  it('rejects a future date and reports missing required fields together', () => {
    expect(() =>
      validateSubmission(
        { ...valid, title: null, description: '  ', incidentDate: '2026-11-01' },
        true,
        today,
        'Asia/Kolkata',
      ),
    ).toThrow(
      expect.objectContaining({
        details: expect.objectContaining({
          fields: expect.arrayContaining([
            expect.objectContaining({ field: 'title' }),
            expect.objectContaining({ field: 'description' }),
            expect.objectContaining({ field: 'incidentDate' }),
          ]),
        }),
      }),
    );
  });

  it('rejects inactive categories and malformed calendar dates', () => {
    expect(() => validateSubmission(valid, false, today, 'Asia/Kolkata')).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(() => validateDraftPatch({ incidentDate: '2026-02-30' })).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });

  it('enforces the documented title limit and the provisional description limit', () => {
    expect(() => validateDraftPatch({ title: 'x'.repeat(151) })).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(() => validateDraftPatch({ description: 'x'.repeat(20_001) })).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
  });
});
