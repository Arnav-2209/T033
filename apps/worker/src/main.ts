/**
 * Dedicated process boundary for scheduled and asynchronous work.
 * Domain jobs are intentionally added in later milestones and must call the
 * same application services used by API routes.
 */
const shutdown = new AbortController();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => shutdown.abort());
}

console.info('SGRS worker foundation started; no jobs are registered.');

// Keep the dedicated process alive until it has actual job consumers.
const keepAlive = setInterval(() => undefined, 60_000);

await new Promise<void>((resolve) => {
  shutdown.signal.addEventListener('abort', () => resolve(), { once: true });
});

clearInterval(keepAlive);
console.info('SGRS worker foundation stopped.');
