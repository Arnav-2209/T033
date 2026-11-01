import { describe, expect, it, vi } from 'vitest';
import { runFeedbackClosureJob, type JobRunStore } from './feedback-closure-job.js';

function storeFixture() {
  const events: unknown[] = [];
  const finish = vi.fn(async (input: Parameters<JobRunStore['finish']>[0]) => {
    events.push(['finish', input]);
  });
  const store: JobRunStore = {
    start: vi.fn(async (input) => {
      events.push(['start', input]);
      return { id: 'job-run-1' };
    }),
    finish,
  };
  return { store, events, finish };
}

describe('feedback closure job runner', () => {
  it('records successful counts and passes the job ID to the shared application service', async () => {
    const { store } = storeFixture();
    const now = new Date('2026-11-01T00:00:00.000Z');
    const service = { closeExpiredFeedback: vi.fn(async () => 3) };
    const result = await runFeedbackClosureJob({ store, service, workerId: 'worker-test', now });

    expect(result).toEqual({ runId: 'job-run-1', closedCount: 3 });
    expect(service.closeExpiredFeedback).toHaveBeenCalledWith(now, 100, 'job-run-1');
    expect(store.finish).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'job-run-1',
        status: 'SUCCEEDED',
        checkedCount: 3,
        succeededCount: 3,
        failedCount: 0,
      }),
    );
  });

  it('records a redacted failure result and rethrows the operation error', async () => {
    const { store, finish } = storeFixture();
    const failure = new Error('sensitive database connection details');
    const service = {
      closeExpiredFeedback: vi.fn(async () => {
        throw failure;
      }),
    };

    await expect(runFeedbackClosureJob({ store, service, workerId: 'worker-test' })).rejects.toBe(
      failure,
    );
    expect(store.finish).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'job-run-1',
        status: 'FAILED',
        failedCount: 1,
        errorSummary: 'Error',
      }),
    );
    expect(JSON.stringify(finish.mock.calls)).not.toContain(
      'sensitive database connection details',
    );
  });
});
