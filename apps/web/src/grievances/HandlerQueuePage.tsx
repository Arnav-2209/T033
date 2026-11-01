import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GrievanceStatus, GrievanceSummary } from '@sgrs/contracts';
import { ApiClientError, api } from '../lib/api.js';
import { WorkspaceLayout } from './WorkspaceLayout.js';
import { ScrollReveal } from '../visual/ScrollReveal.js';

function displayDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value))
    : 'Not set';
}

export function HandlerQueuePage(): ReactNode {
  const [items, setItems] = useState<GrievanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<GrievanceStatus | ''>('');
  const [sort, setSort] = useState<'updated' | 'deadline' | 'status'>('deadline');
  const [workload, setWorkload] = useState<{
    assigned: number;
    overdue: number;
    byStatus: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.listGrievances({
        page: 1,
        pageSize: 100,
        ...(query ? { q: query } : {}),
        ...(status ? { status } : {}),
        sort,
      }),
      api.handlerWorkload(),
    ])
      .then(([response, overview]) => {
        if (active) {
          setItems(response.data.items);
          setWorkload(overview.data);
        }
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof ApiClientError
              ? caught.message
              : 'Assigned cases could not be loaded.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, status, sort]);

  return (
    <WorkspaceLayout
      role="HANDLER"
      eyebrow="HANDLER DESK · ASSIGNED CASES ONLY"
      title="The cases routed to you."
      introduction="This queue contains cases currently assigned to your account. Each target date is the deadline snapshot recorded when the student submitted the grievance."
    >
      <ScrollReveal as="section" className="case-section" aria-labelledby="handler-cases-heading">
        {workload && (
          <div className="workflow-stats" aria-label="Handler workload">
            <div>
              <span>Active assignments</span>
              <strong>{workload.assigned}</strong>
            </div>
            <div>
              <span>Past deadline</span>
              <strong>{workload.overdue}</strong>
            </div>
            <div>
              <span>Under review</span>
              <strong>{workload.byStatus.UNDER_REVIEW ?? 0}</strong>
            </div>
          </div>
        )}
        <div className="case-section__heading">
          <div>
            <p className="eyebrow">ACTIVE ASSIGNMENTS</p>
            <h2 id="handler-cases-heading">Assigned cases</h2>
          </div>
          <span>
            {items.length} {items.length === 1 ? 'case' : 'cases'}
          </span>
        </div>
        <div className="queue-filters">
          <label>
            Search assigned cases
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Case number, title or category"
            />
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as GrievanceStatus | '')}
            >
              <option value="">All active statuses</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="UNDER_REVIEW">Under review</option>
              <option value="AWAITING_INFORMATION">Awaiting information</option>
            </select>
          </label>
          <label>
            Sort by
            <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}>
              <option value="deadline">SLA deadline</option>
              <option value="updated">Recently updated</option>
              <option value="status">Status</option>
            </select>
          </label>
        </div>
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p className="case-loading" role="status">
            Loading assigned cases…
          </p>
        ) : items.length ? (
          <div className="grievance-grid">
            {items.map((item, index) => (
              <ScrollReveal
                as="article"
                className="grievance-card"
                key={item.id}
                delay={(index % 3) * 0.08}
                distance={22}
              >
                <div className="grievance-card__top">
                  <span className="status-pill">{item.status.replaceAll('_', ' ')}</span>
                  <span className="grievance-card__date">{item.caseNumber}</span>
                </div>
                <h3>{item.title ?? 'Untitled grievance'}</h3>
                <p className="grievance-card__meta">
                  {item.categoryName ?? 'Category'}
                  {item.incidentDate ? ' · Incident ' + displayDate(item.incidentDate) : ''}
                </p>
                <div className="grievance-card__footer">
                  <span>Submitted {displayDate(item.submittedAt)}</span>
                  <strong>Deadline {displayDate(item.resolutionDeadline)}</strong>
                </div>
                <Link className="grievance-card__link" to={'/app/handler/grievances/' + item.id}>
                  Review case record <span aria-hidden="true">↗</span>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        ) : (
          <div className="case-empty">
            <span className="case-empty__index">—</span>
            <div>
              <h3>No active assignments</h3>
              <p>New cases routed to you by category will appear here.</p>
            </div>
          </div>
        )}
      </ScrollReveal>
    </WorkspaceLayout>
  );
}
