import type { CategoryAdminItem, StaffDirectoryItem } from '@sgrs/contracts';

export interface AdministrationRepository {
  listCategories(): Promise<CategoryAdminItem[]>;
  createCategory(input: {
    actorId: string;
    name: string;
    description: string | null;
    slaHours: number;
    requestId: string;
  }): Promise<CategoryAdminItem>;
  updateCategory(input: {
    actorId: string;
    categoryId: string;
    changes: { name?: string; description?: string | null; isActive?: boolean; slaHours?: number };
    requestId: string;
  }): Promise<CategoryAdminItem>;
  addHandlerMapping(input: {
    actorId: string;
    categoryId: string;
    handlerId: string;
    isPrimary: boolean;
    requestId: string;
  }): Promise<CategoryAdminItem>;
  endHandlerMapping(input: {
    actorId: string;
    categoryId: string;
    mappingId: string;
    requestId: string;
  }): Promise<CategoryAdminItem>;
  setPrimaryHandler(input: {
    actorId: string;
    categoryId: string;
    mappingId: string;
    requestId: string;
  }): Promise<CategoryAdminItem>;
  saveEscalationRule(input: {
    actorId: string;
    categoryId: string;
    level: number;
    reviewerId: string | null;
    timelineHours: number | null;
    isActive: boolean;
    requestId: string;
  }): Promise<CategoryAdminItem>;
  listDirectory(query: string | undefined): Promise<StaffDirectoryItem[]>;
}
