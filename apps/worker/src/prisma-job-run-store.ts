import type { createResolutionRuntime } from '@sgrs/api/resolution-runtime';
import type { JobRunStore } from './feedback-closure-job.js';

type PrismaClient = ReturnType<typeof createResolutionRuntime>['prisma'];

export class PrismaJobRunStore implements JobRunStore {
  constructor(private readonly prisma: PrismaClient) {}

  async start(input: Parameters<JobRunStore['start']>[0]): Promise<{ id: string }> {
    const run = await this.prisma.jobRun.create({
      data: {
        jobType: input.jobType,
        workerId: input.workerId,
        idempotencyKey: input.idempotencyKey,
        startedAt: input.startedAt,
      },
      select: { id: true },
    });
    return run;
  }

  async finish(input: Parameters<JobRunStore['finish']>[0]): Promise<void> {
    await this.prisma.jobRun.update({
      where: { id: input.id },
      data: {
        finishedAt: input.finishedAt,
        status: input.status,
        checkedCount: input.checkedCount,
        succeededCount: input.succeededCount,
        skippedCount: input.skippedCount,
        failedCount: input.failedCount,
        errorSummary: input.errorSummary,
      },
    });
  }
}
