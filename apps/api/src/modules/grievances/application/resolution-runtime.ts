import { createPrismaClient } from '../../../infrastructure/database/client.js';
import { PrismaGrievanceRepository } from '../../../infrastructure/repositories/prisma-grievance-repository.js';
import { ResolutionService } from './resolution-service.js';

export function createResolutionRuntime(databaseUrl: string) {
  const prisma = createPrismaClient(databaseUrl);
  const repository = new PrismaGrievanceRepository(prisma);
  return { prisma, repository, service: new ResolutionService(repository) };
}
