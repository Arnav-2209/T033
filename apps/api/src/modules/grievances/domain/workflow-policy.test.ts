import { describe, expect, it } from 'vitest';
import {
  requireHandlerTransition,
  validateCaseMessage,
  validateEscalationReason,
} from './workflow-policy.js';

describe('case workflow policy', () => {
  it('allows only the documented Phase 4 handler transitions', () => {
    expect(() => requireHandlerTransition('ASSIGNED', 'UNDER_REVIEW')).not.toThrow();
    expect(() => requireHandlerTransition('ASSIGNED', 'AWAITING_INFORMATION')).toThrow(
      expect.objectContaining({ code: 'INVALID_STATE' }),
    );
    expect(() => requireHandlerTransition('RESOLVED', 'UNDER_REVIEW')).toThrow(
      expect.objectContaining({ statusCode: 409 }),
    );
  });

  it('requires nonblank bounded messages and escalation reasons', () => {
    expect(validateCaseMessage('  Request detail  ')).toBe('Request detail');
    expect(() => validateCaseMessage('  ')).toThrow(
      expect.objectContaining({ code: 'MESSAGE_REQUIRED' }),
    );
    expect(validateEscalationReason('  Needs higher authority  ')).toBe('Needs higher authority');
    expect(() => validateEscalationReason(' ')).toThrow(
      expect.objectContaining({ code: 'REASON_REQUIRED' }),
    );
  });
});
