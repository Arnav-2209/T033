import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173';
const databaseUrl = process.env.E2E_DATABASE_URL;
if (!databaseUrl) throw new Error('Set E2E_DATABASE_URL to a disposable PostgreSQL database.');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @sgrs/api dev',
      url: 'http://127.0.0.1:4400/health/ready',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        API_PORT: '4400',
        API_RATE_LIMIT_MAX: '10000',
        WEB_ORIGIN: baseURL,
        DATABASE_URL: databaseUrl,
      },
    },
    {
      command: 'pnpm --filter @sgrs/web exec vite --host 127.0.0.1 --port 4173 --strictPort',
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { ...process.env, API_PROXY_TARGET: 'http://127.0.0.1:4400' },
    },
  ],
});
