import type { FastifyInstance } from 'fastify';

export async function registerHealthRoutes(
  app: FastifyInstance,
  checkDatabase?: () => Promise<void>,
): Promise<void> {
  app.get<{ Reply: { status: 'ok'; service: 'sgrs-api'; timestamp: string } }>(
    '/health/live',
    async () => ({
      status: 'ok',
      service: 'sgrs-api',
      timestamp: new Date().toISOString(),
    }),
  );

  app.get('/health/ready', async (_request, reply) => {
    if (!checkDatabase) {
      return reply.status(503).send({
        status: 'not_ready',
        dependencies: { database: 'not_configured' },
      });
    }

    try {
      await checkDatabase();
      return reply.status(200).send({ status: 'ready', dependencies: { database: 'ready' } });
    } catch (error) {
      app.log.warn({ err: error }, 'Database readiness check failed');
      return reply.status(503).send({
        status: 'not_ready',
        dependencies: { database: 'unavailable' },
      });
    }
  });
}
