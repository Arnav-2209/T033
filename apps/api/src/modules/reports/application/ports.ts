import type {
  AdminOverviewResponse,
  AuditEventItem,
  CategoryReportResponse,
  HandlerReportResponse,
} from '@sgrs/contracts';

export interface ReportRepository {
  overview(now: Date): Promise<AdminOverviewResponse['data']>;
  categories(input: { from: Date; to: Date }): Promise<CategoryReportResponse['data']['items']>;
  handlers(input: { from: Date; to: Date }): Promise<HandlerReportResponse['data']['items']>;
  auditTrail(input: {
    grievanceId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: AuditEventItem[]; total: number }>;
}
