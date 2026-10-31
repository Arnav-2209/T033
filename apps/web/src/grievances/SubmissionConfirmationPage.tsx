import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { GrievanceDetail } from '@sgrs/contracts';
import { ApiClientError, api } from '../lib/api.js';
import { WorkspaceLayout } from './WorkspaceLayout.js';

const statusLabels: Record<string, string> = {
  ASSIGNED: 'Assigned to a category handler',
  PENDING_MANUAL_ASSIGNMENT: 'Waiting for manual assignment',
};

function displayDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'long' }).format(new Date(value))
    : 'Not available';
}

export function SubmissionConfirmationPage(): ReactNode {
  const { grievanceId } = useParams();
  const [grievance, setGrievance] = useState<GrievanceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!grievanceId)
      return () => {
        active = false;
      };
    api
      .getGrievance(grievanceId)
      .then((response) => {
        if (active) setGrievance(response.data);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof ApiClientError
              ? caught.message
              : 'Submission confirmation could not be loaded.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [grievanceId]);

  return (
    <WorkspaceLayout
      role="STUDENT"
      eyebrow="SUBMISSION RECEIVED · YOUR CASE IS RECORDED"
      title="Your concern has a reference."
      introduction="Keep this case number for your records. You can return to the case page at any time to follow status updates and supporting documents."
    >
      {loading ? (
        <p className="case-loading" role="status">
          Loading your confirmation…
        </p>
      ) : error || !grievance ? (
        <p className="notice notice--error" role="alert">
          {error ?? 'Submission was not found.'}
        </p>
      ) : (
        <section className="submission-confirmation" aria-labelledby="confirmation-reference">
          <p className="eyebrow">CASE REFERENCE</p>
          <h2 id="confirmation-reference">{grievance.caseNumber}</h2>
          <span className={'status-pill status-pill--' + grievance.status.toLowerCase()}>
            {statusLabels[grievance.status] ?? grievance.status.replaceAll('_', ' ')}
          </span>
          <p className="submission-confirmation__copy">
            {grievance.status === 'PENDING_MANUAL_ASSIGNMENT'
              ? 'The administrator has been notified because this category does not currently have an eligible primary handler.'
              : 'The configured category handler has been notified of the assignment.'}
          </p>
          <dl className="case-facts case-facts--confirmation">
            <div>
              <dt>Category</dt>
              <dd>{grievance.categoryName}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>{displayDate(grievance.submittedAt)}</dd>
            </div>
            <div>
              <dt>Target deadline</dt>
              <dd>{displayDate(grievance.resolutionDeadline)}</dd>
            </div>
          </dl>
          <div className="submission-confirmation__actions">
            <Link className="button button--primary" to={'/app/student/grievances/' + grievance.id}>
              View case history <span aria-hidden="true">↗</span>
            </Link>
            <Link className="button button--quiet" to="/app/student">
              Return to my cases
            </Link>
          </div>
        </section>
      )}
    </WorkspaceLayout>
  );
}
