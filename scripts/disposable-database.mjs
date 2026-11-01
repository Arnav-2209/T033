import { createRequire } from 'node:module';

const apiRequire = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = apiRequire('pg');

function assertDatabaseName(databaseUrl, expectedName) {
  const target = new URL(databaseUrl);
  const name = target.pathname.slice(1);
  if (name !== expectedName) {
    throw new Error(
      `Refusing database operation: expected ${expectedName}, got ${name || '(empty)'}.`,
    );
  }
  return target;
}

async function withMaintenanceClient(databaseUrl, operation) {
  const target = new URL(databaseUrl);
  target.pathname = '/postgres';
  const client = new Client({ connectionString: target.toString() });
  await client.connect();
  try {
    await operation(client);
  } finally {
    await client.end();
  }
}

export async function recreateDisposableDatabase(databaseUrl, expectedName) {
  assertDatabaseName(databaseUrl, expectedName);
  await withMaintenanceClient(databaseUrl, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${expectedName} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${expectedName}`);
  });
}

export async function dropDisposableDatabase(databaseUrl, expectedName) {
  assertDatabaseName(databaseUrl, expectedName);
  await withMaintenanceClient(databaseUrl, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${expectedName} WITH (FORCE)`);
  });
}
