import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type {
  AdminOverviewResponse,
  CategoryReportResponse,
  HandlerReportResponse,
  UserRole,
} from '@sgrs/contracts';
import { WorkspaceLayout } from '../grievances/WorkspaceLayout.js';
import { ApiClientError, api } from '../lib/api.js';
import { useAuth } from '../auth/AuthProvider.js';
import { roleRoutes } from '../auth/LoginPage.js';
import { ScrollReveal } from '../visual/ScrollReveal.js';

const statusLabels: Record<string, string> = {
  SUBMITTED: 'Submitted',
  PENDING_MANUAL_ASSIGNMENT: 'Manual assignment',
  ASSIGNED: 'Assigned',
  UNDER_REVIEW: 'Under review',
  AWAITING_INFORMATION: 'Awaiting information',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  WITHDRAWN: 'Withdrawn',
};

function utcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function rangeInstants(from: string, to: string): { from: string; to: string } {
  return {
    from: new Date(`${from}T00:00:00.000Z`).toISOString(),
    to: new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000).toISOString(),
  };
}

export function ReportsPage({
  role,
}: {
  role: Extract<UserRole, 'ADMINISTRATOR' | 'MANAGEMENT'>;
}): ReactNode {
  const { user } = useAuth();
  const today = new Date();
  const [from, setFrom] = useState(() => utcDate(new Date(today.getTime() - 29 * 86_400_000)));
  const [to, setTo] = useState(() => utcDate(today));
  const [overview, setOverview] = useState<AdminOverviewResponse['data'] | null>(null);
  const [categories, setCategories] = useState<CategoryReportResponse['data']['items']>([]);
  const [handlers, setHandlers] = useState<HandlerReportResponse['data']['items']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = role === 'ADMINISTRATOR';

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const { from: fromInstant, to: toInstant } = rangeInstants(from, to);
      const base = isAdmin ? api.adminOverview() : api.managementOverview();
      const [summary, byCategory, byHandler] = await Promise.all([
        base,
        api.categoryReport(fromInstant, toInstant, isAdmin ? 'admin' : 'management'),
        isAdmin ? api.handlerReport(fromInstant, toInstant) : Promise.resolve(null),
      ]);
      setOverview(summary.data);
      setCategories(byCategory.data.items);
      setHandlers(byHandler?.data.items ?? []);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Reports could not be loaded.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <WorkspaceLayout
      role={role}
      eyebrow={
        isAdmin ? 'ADMINISTRATION · OPERATING PICTURE' : 'INSTITUTE OVERSIGHT · AGGREGATE ONLY'
      }
      title={isAdmin ? 'Reports and oversight.' : 'Institutional overview.'}
      introduction={
        isAdmin
          ? 'Review case volumes, category activity, handler workload and resolution time.'
          : 'A case-free summary of grievance volumes and category trends for institutional oversight.'
      }
      actions={
        <Link className="button button--quiet" to={user ? roleRoutes[user.role] : '/'}>
          Back to workspace
        </Link>
      }
    >
      <ScrollReveal
        as="section"
        className="case-detail-panel report-panel"
        aria-label="Report period"
      >
        <div className="report-period">
          <label>
            From (UTC)
            <input
              type="date"
              value={from}
              max={to}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label>
            To (UTC)
            <input
              type="date"
              value={to}
              min={from}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
          <button
            className="button button--primary"
            onClick={() => void load()}
            disabled={loading || !from || !to}
          >
            Update reports
          </button>
        </div>
      </ScrollReveal>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="case-loading" role="status">
          Preparing aggregate reports…
        </p>
      ) : (
        overview && (
          <>
            <ScrollReveal as="section" className="report-metrics" aria-label="Case summary">
              <article>
                <span>Submitted cases</span>
                <strong>{overview.totalCases}</strong>
              </article>
              <article>
                <span>Active cases</span>
                <strong>{overview.openCases}</strong>
              </article>
              <article>
                <span>Overdue cases</span>
                <strong>{overview.overdueCases}</strong>
              </article>
            </ScrollReveal>
            <ScrollReveal
              as="section"
              className="case-detail-panel report-panel"
              aria-labelledby="status-report-heading"
            >
              <p className="eyebrow">CURRENT CASE REGISTER</p>
              <h2 id="status-report-heading">Cases by status</h2>
              <div className="report-status-list">
                {Object.entries(overview.byStatus).map(([status, count]) => (
                  <div key={status}>
                    <span>{statusLabels[status] ?? status}</span>
                    <strong>{count}</strong>
                  </div>
                ))}
                {Object.keys(overview.byStatus).length === 0 && (
                  <p>No submitted cases are recorded.</p>
                )}
              </div>
            </ScrollReveal>
            <ScrollReveal
              as="section"
              className="case-detail-panel report-panel"
              aria-labelledby="category-report-heading"
            >
              <p className="eyebrow">SELECTED PERIOD · UTC</p>
              <h2 id="category-report-heading">Category activity</h2>
              <div className="table-wrap">
                <table>
                  <caption className="visually-hidden">
                    Submitted grievance totals by category and status for the selected period
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Category</th>
                      <th scope="col">Total</th>
                      <th scope="col">By status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((item) => (
                      <tr key={item.categoryId ?? 'uncategorized'}>
                        <th scope="row">{item.categoryName}</th>
                        <td>{item.total}</td>
                        <td>
                          {Object.entries(item.byStatus)
                            .map(([status, count]) => `${statusLabels[status] ?? status}: ${count}`)
                            .join(' · ')}
                        </td>
                      </tr>
                    ))}
                    {categories.length === 0 && (
                      <tr>
                        <td colSpan={3}>No submitted cases in this period.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </ScrollReveal>
            {isAdmin && (
              <ScrollReveal
                as="section"
                className="case-detail-panel report-panel"
                aria-labelledby="handler-report-heading"
              >
                <p className="eyebrow">STAFF WORKLOAD · SELECTED PERIOD</p>
                <h2 id="handler-report-heading">Handler performance</h2>
                <p>
                  The selected period applies to case submission dates. Time is elapsed hours from
                  submission to the first recorded resolution; active assignments show the current
                  queue.
                </p>
                <div className="table-wrap">
                  <table>
                    <caption className="visually-hidden">
                      Current assignments and first-resolution time for cases submitted in the
                      selected period
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Handler</th>
                        <th scope="col">Current active assignments</th>
                        <th scope="col">Cases resolved</th>
                        <th scope="col">Average hours to first resolution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {handlers.map((item) => (
                        <tr key={item.handlerId}>
                          <th scope="row">{item.handlerName}</th>
                          <td>{item.activeAssignments}</td>
                          <td>{item.resolvedCount}</td>
                          <td>{item.averageHoursToFirstResolution ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ScrollReveal>
            )}
          </>
        )
      )}
    </WorkspaceLayout>
  );
}
