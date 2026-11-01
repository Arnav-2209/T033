import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { GrievanceSummary } from '@sgrs/contracts';
import { ApiClientError, api } from '../lib/api.js';
import { WorkspaceLayout } from './WorkspaceLayout.js';
import { ScrollReveal } from '../visual/ScrollReveal.js';

const statusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  PENDING_MANUAL_ASSIGNMENT: 'Pending assignment',
  ASSIGNED: 'Assigned',
  UNDER_REVIEW: 'Under review',
  AWAITING_INFORMATION: 'Awaiting information',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  WITHDRAWN: 'Withdrawn',
};

function displayDate(value: string | null): string {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value));
}

function GrievanceCard({
  grievance,
  draft = false,
}: {
  grievance: GrievanceSummary;
  draft?: boolean;
}): ReactNode {
  return (
    <ScrollReveal as="article" className="grievance-card" distance={22}>
      <div className="grievance-card__top">
        <span className={'status-pill status-pill--' + grievance.status.toLowerCase()}>
          {statusLabels[grievance.status] ?? grievance.status}
        </span>
        <span className="grievance-card__date">
          {draft ? 'Last saved ' + displayDate(grievance.updatedAt) : grievance.caseNumber}
        </span>
      </div>
      <h3>{grievance.title || 'Untitled draft'}</h3>
      <p className="grievance-card__meta">
        {grievance.categoryName ?? 'Category not selected'}
        {grievance.incidentDate ? ' · Incident ' + displayDate(grievance.incidentDate) : ''}
      </p>
      {!draft && (
        <div className="grievance-card__footer">
          <span>
            {grievance.assignedHandlerName
              ? 'Assigned to ' + grievance.assignedHandlerName
              : grievance.status === 'PENDING_MANUAL_ASSIGNMENT'
                ? 'An administrator will assign a handler'
                : 'Status updated ' + displayDate(grievance.updatedAt)}
          </span>
          {grievance.resolutionDeadline && (
            <span>Target date {displayDate(grievance.resolutionDeadline)}</span>
          )}
        </div>
      )}
      <Link
        className="grievance-card__link"
        to={
          draft
            ? '/app/student/grievances/' + grievance.id + '/edit'
            : '/app/student/grievances/' + grievance.id
        }
      >
        {draft ? 'Continue draft' : 'View case'} <span aria-hidden="true">↗</span>
      </Link>
    </ScrollReveal>
  );
}

export function StudentDashboardPage(): ReactNode {
  const [items, setItems] = useState<GrievanceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .listGrievances({ page: 1, pageSize: 100 })
      .then((response) => {
        if (active) setItems(response.data.items);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof ApiClientError
              ? caught.message
              : 'Your grievances could not be loaded. Try again.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const drafts = useMemo(
    () => items.filter((item) => item.status === 'DRAFT' && item.hasDraftContent),
    [items],
  );
  const submitted = useMemo(() => items.filter((item) => item.status !== 'DRAFT'), [items]);
  const openCount = submitted.filter(
    (item) => !['RESOLVED', 'CLOSED', 'WITHDRAWN'].includes(item.status),
  ).length;

  return (
    <WorkspaceLayout
      role="STUDENT"
      eyebrow="STUDENT SERVICES · PRIVATE CASE FILES"
      title="Your concerns, clearly tracked."
      introduction="Raise a concern, keep its supporting records together and follow each step as it moves through the institute."
      actions={
        <Link className="button button--primary" to="/app/student/grievances/new">
          Start a grievance <span aria-hidden="true">↗</span>
        </Link>
      }
    >
      <ScrollReveal
        as="section"
        className={drafts.length ? 'case-stats' : 'case-stats case-stats--without-drafts'}
        aria-label="Grievance overview"
      >
        <div>
          <span>Open cases</span>
          <strong>{openCount}</strong>
        </div>
        {drafts.length > 0 && (
          <div>
            <span>Saved drafts</span>
            <strong>{drafts.length}</strong>
          </div>
        )}
        <div>
          <span>Total submitted</span>
          <strong>{submitted.length}</strong>
        </div>
      </ScrollReveal>

      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="case-loading" role="status">
          Loading your case file…
        </p>
      ) : (
        <>
          {drafts.length > 0 && (
            <ScrollReveal as="section" className="case-section" aria-labelledby="drafts-heading">
              <div className="case-section__heading">
                <div>
                  <p className="eyebrow">IN PROGRESS</p>
                  <h2 id="drafts-heading">Saved drafts</h2>
                </div>
                <span>
                  {drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'}
                </span>
              </div>
              <div className="grievance-grid">
                {drafts.map((item) => (
                  <GrievanceCard key={item.id} grievance={item} draft />
                ))}
              </div>
            </ScrollReveal>
          )}

          <ScrollReveal as="section" className="case-section" aria-labelledby="cases-heading">
            <div className="case-section__heading">
              <div>
                <p className="eyebrow">YOUR RECORD</p>
                <h2 id="cases-heading">Submitted grievances</h2>
              </div>
              <span>
                {submitted.length} {submitted.length === 1 ? 'case' : 'cases'}
              </span>
            </div>
            {submitted.length ? (
              <div className="grievance-grid">
                {submitted.map((item) => (
                  <GrievanceCard key={item.id} grievance={item} />
                ))}
              </div>
            ) : (
              <div className="case-empty case-empty--subtle">
                <span className="case-empty__index">02</span>
                <div>
                  <h3>Your submitted cases will appear here</h3>
                  <p>
                    Once submitted, each case receives a reference number, status history and target
                    deadline.
                  </p>
                </div>
              </div>
            )}
          </ScrollReveal>
        </>
      )}
    </WorkspaceLayout>
  );
}
