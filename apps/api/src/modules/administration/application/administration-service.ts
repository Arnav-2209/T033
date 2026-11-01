import type { UserRole } from '@sgrs/contracts';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import type { AdministrationRepository } from './ports.js';

export class AdministrationService {
  constructor(private readonly repository: AdministrationRepository) {}

  listCategories(actor: { role: UserRole }) {
    this.assertAdmin(actor.role);
    return this.repository.listCategories();
  }

  createCategory(
    input: Parameters<AdministrationRepository['createCategory']>[0] & { role: UserRole },
  ) {
    this.assertAdmin(input.role);
    return this.repository.createCategory(input);
  }

  updateCategory(
    input: Parameters<AdministrationRepository['updateCategory']>[0] & { role: UserRole },
  ) {
    this.assertAdmin(input.role);
    if (Object.keys(input.changes).length === 0) {
      throw new AppError(400, 'EMPTY_UPDATE', 'Provide at least one category field to update.');
    }
    return this.repository.updateCategory(input);
  }

  addHandlerMapping(
    input: Parameters<AdministrationRepository['addHandlerMapping']>[0] & { role: UserRole },
  ) {
    this.assertAdmin(input.role);
    return this.repository.addHandlerMapping(input);
  }

  endHandlerMapping(
    input: Parameters<AdministrationRepository['endHandlerMapping']>[0] & { role: UserRole },
  ) {
    this.assertAdmin(input.role);
    return this.repository.endHandlerMapping(input);
  }

  setPrimaryHandler(
    input: Parameters<AdministrationRepository['setPrimaryHandler']>[0] & { role: UserRole },
  ) {
    this.assertAdmin(input.role);
    return this.repository.setPrimaryHandler(input);
  }

  saveEscalationRule(
    input: Parameters<AdministrationRepository['saveEscalationRule']>[0] & { role: UserRole },
  ) {
    this.assertAdmin(input.role);
    return this.repository.saveEscalationRule(input);
  }

  listDirectory(input: { role: UserRole; query?: string }) {
    this.assertAdmin(input.role);
    return this.repository.listDirectory(input.query);
  }

  private assertAdmin(role: UserRole): void {
    if (role !== 'ADMINISTRATOR') {
      throw new AppError(403, 'FORBIDDEN', 'Administrator access is required.');
    }
  }
}
