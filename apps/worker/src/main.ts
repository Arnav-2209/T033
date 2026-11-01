import { hostname } from 'node:os';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { createResolutionRuntime } from '@sgrs/api/resolution-runtime';
import { runFeedbackClosureJob } from './feedback-closure-job.js';
import { PrismaJobRunStore } from './prisma-job-run-store.js';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required by the SGRS worker.');

const runtime = createResolutionRuntime(databaseUrl);
const store = new PrismaJobRunStore(runtime.prisma);
const workerId = `${hostname()}:${process.pid}`;
const pollIntervalMs = 60_000;
const shutdown = new AbortController();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => shutdown.abort());
}

async function sleepUntilNextRun(): Promise<void> {
  await new Promise<void>((resolveSleep) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      shutdown.signal.removeEventListener('abort', onAbort);
      resolveSleep();
    };
    const onAbort = () => {
      clearTimeout(timer);
      finish();
    };
    const timer = setTimeout(finish, pollIntervalMs);
    shutdown.signal.addEventListener('abort', onAbort, { once: true });
    if (shutdown.signal.aborted) onAbort();
  });
}

console.info('SGRS worker started; expired-feedback closure is scheduled every 60 seconds.');
try {
  while (!shutdown.signal.aborted) {
    try {
      const result = await runFeedbackClosureJob({
        store,
        service: runtime.service,
        workerId,
      });
      if (result.closedCount > 0) {
        console.info(`Feedback closure job closed ${result.closedCount} grievance(s).`);
      }
    } catch (error) {
      console.error(
        'Feedback closure job failed.',
        error instanceof Error ? error.name : 'UnknownError',
      );
    }
    if (!shutdown.signal.aborted) await sleepUntilNextRun();
  }
} finally {
  await runtime.prisma.$disconnect();
  console.info('SGRS worker stopped.');
}
