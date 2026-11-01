import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dropDisposableDatabase, recreateDisposableDatabase } from './disposable-database.mjs';

const sourceUrl = process.env.DATABASE_URL;
let e2eUrl = process.env.E2E_DATABASE_URL;
if (!e2eUrl && process.env.CI) {
  throw new Error('CI must explicitly set E2E_DATABASE_URL to its disposable PostgreSQL database.');
}
if (!e2eUrl) {
  if (!sourceUrl) throw new Error('DATABASE_URL must identify the local PostgreSQL server.');
  const localUrl = new URL(sourceUrl);
  if (!['/sgrs', '/sgrs_demo'].includes(localUrl.pathname)) {
    throw new Error(
      'Local browser tests derive sgrs_e2e only from the sgrs or sgrs_demo database.',
    );
  }
  localUrl.pathname = '/sgrs_e2e';
  e2eUrl = localUrl.toString();
}

const e2eDatabaseName = new URL(e2eUrl).pathname.slice(1);
if (e2eDatabaseName !== 'sgrs_e2e') {
  throw new Error('The browser test runner only accepts the disposable sgrs_e2e database.');
}

function run(command, args, env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status}.`);
}

const e2eEnvironment = { ...process.env, DATABASE_URL: e2eUrl, E2E_DATABASE_URL: e2eUrl };
await recreateDisposableDatabase(e2eUrl, e2eDatabaseName);
try {
  run('pnpm', ['db:migrate:deploy'], e2eEnvironment);
  run('pnpm', ['db:seed'], e2eEnvironment);
  run(
    process.execPath,
    [
      fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)),
      'test',
      ...process.argv.slice(2),
    ],
    e2eEnvironment,
  );
} finally {
  await dropDisposableDatabase(e2eUrl, e2eDatabaseName);
}
