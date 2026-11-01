import { describe, expect, it } from 'vitest';
import {
  isWithinFeedbackWindow,
  validateFeedbackRating,
  validateResolutionActor,
  validateResolutionRemarks,
} from './resolution-policy.js';

describe('resolution policy', () => {
  it('accepts feedback at the deadline and rejects later timestamps', () => {
    const deadline = new Date('2026-11-04T10:00:00.000Z');
    expect(isWithinFeedbackWindow(deadline, deadline)).toBe(true);
    expect(isWithinFeedbackWindow(new Date(deadline.getTime() + 1), deadline)).toBe(false);
  });

  it('requires nonblank resolution remarks', () => {
    expect(validateResolutionRemarks('  Fixed the reported issue.  ')).toBe(
      'Fixed the reported issue.',
    );
    expect(() => validateResolutionRemarks('  ')).toThrow(
      expect.objectContaining({ code: 'REMARKS_REQUIRED' }),
    );
  });

  it('accepts integer feedback ratings from one through five only', () => {
    for (const rating of [1, 2, 3, 4, 5]) expect(validateFeedbackRating(rating)).toBe(rating);
    for (const rating of [0, 6, 1.5, Number.NaN]) {
      expect(() => validateFeedbackRating(rating)).toThrow(
        expect.objectContaining({ code: 'RATING_INVALID' }),
      );
    }
  });

  it('allows resolution only for handler or reviewer roles', () => {
    expect(() => validateResolutionActor('HANDLER')).not.toThrow();
    expect(() => validateResolutionActor('REVIEWER')).not.toThrow();
    expect(() => validateResolutionActor('STUDENT')).toThrow(
      expect.objectContaining({ statusCode: 403 }),
    );
  });
});
