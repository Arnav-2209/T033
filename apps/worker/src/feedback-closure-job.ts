export interface JobRunStore {
  start(input: {
    jobType: string;
    workerId: string;
    idempotencyKey: string;
    startedAt: Date;
  }): Promise<{ id: string }>;
  finish(input: {
    id: string;
    finishedAt: Date;
    status: 'SUCCEEDED' | 'FAILED';
    checkedCount: number;
    succeededCount: number;
    skippedCount: number;
    failedCount: number;
    errorSummary: string | null;
  }): Promise<void>;
}

export interface ExpiredFeedbackCloser {
  closeExpiredFeedback(now: Date, batchSize: number, jobRunId: string): Promise<number>;
}

export async function runFeedbackClosureJob(input: {
  store: JobRunStore;
  service: ExpiredFeedbackCloser;
  workerId: string;
  now?: Date;
  batchSize?: number;
}): Promise<{ runId: string; closedCount: number }> {
  const startedAt = input.now ?? new Date();
  const job = await input.store.start({
    jobType: 'AUTO_CLOSE_EXPIRED_FEEDBACK',
    workerId: input.workerId,
    idempotencyKey: `feedback-close:${input.workerId}:${crypto.randomUUID()}`,
    startedAt,
  });
  try {
    const closedCount = await input.service.closeExpiredFeedback(
      startedAt,
      input.batchSize ?? 100,
      job.id,
    );
    await input.store.finish({
      id: job.id,
      finishedAt: new Date(),
      status: 'SUCCEEDED',
      checkedCount: closedCount,
      succeededCount: closedCount,
      skippedCount: 0,
      failedCount: 0,
      errorSummary: null,
    });
    return { runId: job.id, closedCount };
  } catch (error) {
    await input.store.finish({
      id: job.id,
      finishedAt: new Date(),
      status: 'FAILED',
      checkedCount: 0,
      succeededCount: 0,
      skippedCount: 0,
      failedCount: 1,
      errorSummary: error instanceof Error ? error.name : 'UnknownError',
    });
    throw error;
  }
}
