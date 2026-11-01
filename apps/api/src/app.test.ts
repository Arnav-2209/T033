import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadEnvironment } from './config/env.js';

describe('foundation HTTP app', () => {
  it('serves a liveness response without requiring a database connection', async () => {
    const app = await buildApp(loadEnvironment({ NODE_ENV: 'test' }));
    const response = await app.inject({ method: 'GET', url: '/health/live' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'sgrs-api' });
    await app.close();
  });

  it('fails readiness when the database has not been configured', async () => {
    const app = await buildApp(loadEnvironment({ NODE_ENV: 'test' }));
    const response = await app.inject({ method: 'GET', url: '/health/ready' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      status: 'not_ready',
      dependencies: { database: 'not_configured' },
    });
    await app.close();
  });

  it('returns a request id with a normalized error envelope', async () => {
    const app = await buildApp(loadEnvironment({ NODE_ENV: 'test' }));
    app.get('/test-error', async () => {
      throw new Error('private error detail');
    });

    const response = await app.inject({ method: 'GET', url: '/test-error' });
    expect(response.statusCode).toBe(500);
    expect(response.json().error).toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(response.json().error.message).not.toContain('private error detail');
    expect(response.json().error.requestId).toBeTruthy();
    await app.close();
  });

  it('sets baseline browser security headers on API responses', async () => {
    const app = await buildApp(loadEnvironment({ NODE_ENV: 'test' }));
    const response = await app.inject({ method: 'GET', url: '/health/live' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['referrer-policy']).toBeTruthy();
    expect(response.headers['x-powered-by']).toBeUndefined();
    await app.close();
  });
});
