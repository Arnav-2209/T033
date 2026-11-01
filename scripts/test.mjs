import { spawnSync } from 'node:child_process';
import { dropDisposableDatabase, recreateDisposableDatabase } from './disposable-database.mjs';

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) throw new Error('DATABASE_URL must identify the local PostgreSQL server.');

let testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl && process.env.CI) {
  throw new Error(
    'CI must explicitly set TEST_DATABASE_URL to its disposable PostgreSQL database.',
  );
}
if (!testUrl) {
  const localUrl = new URL(sourceUrl);
  if (!['/sgrs', '/sgrs_demo'].includes(localUrl.pathname)) {
    throw new Error(
      'Local tests derive sgrs_test only from the documented sgrs or sgrs_demo database.',
    );
  }
  localUrl.pathname = '/sgrs_test';
  testUrl = localUrl.toString();
}

const testDatabaseName = new URL(testUrl).pathname.slice(1);
if (testDatabaseName !== 'sgrs_test') {
  throw new Error('The test runner only accepts the disposable sgrs_test database.');
}

function run(command, args, env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status}.`);
}

const testEnvironment = { ...process.env, DATABASE_URL: testUrl, TEST_DATABASE_URL: testUrl };
run('pnpm', ['db:generate'], process.env);
run('pnpm', ['--filter', '@sgrs/contracts', 'build'], process.env);
await recreateDisposableDatabase(testUrl, testDatabaseName);
try {
  run('pnpm', ['db:migrate:deploy'], testEnvironment);
  run('pnpm', ['db:seed'], testEnvironment);
  run('pnpm', ['--filter', '@sgrs/api', 'test'], testEnvironment);
  run('pnpm', ['--filter', '@sgrs/web', 'test'], testEnvironment);
  run('pnpm', ['--filter', '@sgrs/worker', 'test'], testEnvironment);
} finally {
  await dropDisposableDatabase(testUrl, testDatabaseName);
}
