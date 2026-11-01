/** Integration tests write irreversible workflow and audit records; never let them target demo data. */
export function requireIsolatedTestDatabase(databaseUrl: string): void {
  const databaseName = new URL(databaseUrl).pathname.slice(1);
  if (databaseName !== 'sgrs_test') {
    throw new Error(
      `API integration tests require the disposable sgrs_test database; received ${databaseName || '(empty)'}. Run pnpm test.`,
    );
  }
}
