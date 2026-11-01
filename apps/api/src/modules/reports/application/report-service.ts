import type { UserRole } from '@sgrs/contracts';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import type { ReportRepository } from './ports.js';

export class ReportService {
  constructor(
    private readonly repository: ReportRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  overview(actor: { role: UserRole }) {
    this.assertReportRole(actor.role);
    return this.repository.overview(this.now());
  }

  async categoryReport(actor: { role: UserRole }, input: { from: Date; to: Date }) {
    this.assertReportRole(actor.role);
    const items = await this.repository.categories(input);
    return { from: input.from.toISOString(), to: input.to.toISOString(), items };
  }

  async handlerReport(actor: { role: UserRole }, input: { from: Date; to: Date }) {
    if (actor.role !== 'ADMINISTRATOR') {
      throw new AppError(403, 'FORBIDDEN', 'Administrator access is required for handler reports.');
    }
    const items = await this.repository.handlers(input);
    return { from: input.from.toISOString(), to: input.to.toISOString(), items };
  }

  async auditTrail(
    actor: { role: UserRole },
    input: { grievanceId: string; page: number; pageSize: number },
  ) {
    if (actor.role !== 'ADMINISTRATOR') {
      throw new AppError(403, 'FORBIDDEN', 'Administrator access is required for audit trails.');
    }
    const result = await this.repository.auditTrail(input);
    return { ...result, page: input.page, pageSize: input.pageSize };
  }

  private assertReportRole(role: UserRole): void {
    if (role !== 'ADMINISTRATOR' && role !== 'MANAGEMENT') {
      throw new AppError(403, 'FORBIDDEN', 'Administrative report access is required.');
    }
  }
}
