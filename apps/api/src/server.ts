import { resolve } from 'node:path';
import { buildApp } from './app.js';
import { loadEnvironment } from './config/env.js';
import { createPrismaClient } from './infrastructure/database/client.js';
import { PrismaAuthRepository } from './infrastructure/repositories/prisma-auth-repository.js';
import { PrismaGrievanceRepository } from './infrastructure/repositories/prisma-grievance-repository.js';
import { LocalEvidenceStorage } from './infrastructure/storage/local-evidence-storage.js';
import { PrismaNotificationRepository } from './infrastructure/repositories/prisma-notification-repository.js';
import { PrismaAdministrationRepository } from './infrastructure/repositories/prisma-administration-repository.js';
import { PrismaReportRepository } from './infrastructure/repositories/prisma-report-repository.js';

const environment = loadEnvironment();
const database = environment.DATABASE_URL
  ? createPrismaClient(environment.DATABASE_URL)
  : undefined;
const app = await buildApp(environment, {
  ...(database
    ? {
        checkDatabase: async () => {
          await database.$queryRaw`SELECT 1`;
        },
        authRepository: new PrismaAuthRepository(database),
        grievanceRepository: new PrismaGrievanceRepository(database),
        notificationRepository: new PrismaNotificationRepository(database),
        administrationRepository: new PrismaAdministrationRepository(database),
        reportRepository: new PrismaReportRepository(database),
        evidenceStorage: new LocalEvidenceStorage(resolve(environment.EVIDENCE_STORAGE_DIR)),
      }
    : {}),
});

if (database) app.addHook('onClose', async () => database.$disconnect());

try {
  await app.listen({ host: environment.API_HOST, port: environment.API_PORT });
} catch (error) {
  app.log.error({ err: error }, 'Failed to start SGRS API');
  await app.close();
  process.exitCode = 1;
}
