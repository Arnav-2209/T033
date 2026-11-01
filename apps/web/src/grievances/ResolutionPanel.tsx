import { useState, type ReactNode } from 'react';
import type { GrievanceDetail, UserRole } from '@sgrs/contracts';
import { ApiClientError, api } from '../lib/api.js';

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function ResolutionPanel(props: {
  grievance: GrievanceDetail;
  role: UserRole;
  userId: string | undefined;
  onUpdated: (grievance: GrievanceDetail) => void;
}): ReactNode | null {
  const { grievance, role, userId, onUpdated } = props;
  const [remarks, setRemarks] = useState('');
  const [rating, setRating] = useState('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentCycle = grievance.resolutionCycles.find((cycle) => cycle.isCurrent) ?? null;
  const canResolveHandler = role === 'HANDLER' && grievance.status === 'UNDER_REVIEW';
  const canResolveReviewer =
    role === 'REVIEWER' &&
    grievance.status === 'ESCALATED' &&
    grievance.escalationLevels.some(
      (level) => level.reviewerId === userId && level.state === 'UNDER_REVIEWER_HANDLING',
    );
  const ownsFeedback =
    role === 'STUDENT' &&
    grievance.status === 'RESOLVED' &&
    currentCycle !== null &&
    currentCycle.feedback === null;
  const canFeedbackNow =
    ownsFeedback &&
    currentCycle !== null &&
    Date.now() <= new Date(currentCycle.feedbackDeadline).getTime();

  if (!currentCycle && !canResolveHandler && !canResolveReviewer) return null;

  async function submit(action: () => Promise<{ data: GrievanceDetail }>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      onUpdated((await action()).data);
      setRemarks('');
      setRating('');
      setComment('');
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'The action could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="case-detail-panel case-detail-panel--wide"
      aria-labelledby="resolution-heading"
    >
      <p className="eyebrow">RESOLUTION RECORD</p>
      <h2 id="resolution-heading">Resolution and feedback</h2>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}

      {(canResolveHandler || canResolveReviewer) && (
        <div className="workflow-panel">
          <label>
            Resolution remarks <span aria-hidden="true">*</span>
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              rows={4}
            />
          </label>
          <p>The student will be notified and can provide feedback for three days.</p>
          <button
            className="button button--primary"
            disabled={busy || !remarks.trim()}
            onClick={() =>
              void submit(() =>
                api.resolveGrievance(grievance.id, role as 'HANDLER' | 'REVIEWER', remarks),
              )
            }
          >
            {busy ? 'Recording resolution…' : 'Resolve grievance'}
          </button>
        </div>
      )}

      {grievance.resolutionCycles.length > 0 && (
        <ol className="resolution-list">
          {grievance.resolutionCycles.map((cycle) => (
            <li key={cycle.id}>
              <div className="resolution-list__heading">
                <h3>Resolution cycle {cycle.cycleNumber}</h3>
                <span>{cycle.isCurrent ? 'Current cycle' : 'Previous cycle'}</span>
              </div>
              <p>{cycle.remarks}</p>
              <dl className="case-facts">
                <div>
                  <dt>Recorded by</dt>
                  <dd>{cycle.resolvedByName}</dd>
                </div>
                <div>
                  <dt>Resolved</dt>
                  <dd>{dateTime(cycle.resolvedAt)}</dd>
                </div>
                <div>
                  <dt>Feedback deadline</dt>
                  <dd>{dateTime(cycle.feedbackDeadline)}</dd>
                </div>
                <div>
                  <dt>Closed</dt>
                  <dd>
                    {cycle.closedAt ? dateTime(cycle.closedAt) : 'Awaiting feedback or timeout'}
                  </dd>
                </div>
              </dl>
              {cycle.feedback && (
                <div className="resolution-feedback">
                  <strong>Student feedback · {cycle.feedback.rating}/5</strong>
                  <time dateTime={cycle.feedback.submittedAt}>
                    {dateTime(cycle.feedback.submittedAt)}
                  </time>
                  {cycle.feedback.comment && <p>{cycle.feedback.comment}</p>}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {ownsFeedback && canFeedbackNow && currentCycle && (
        <div className="workflow-panel">
          <h3>Share feedback on this resolution</h3>
          <p>
            Submit feedback by {dateTime(currentCycle.feedbackDeadline)}. Your response closes this
            grievance.
          </p>
          <label>
            Rating <span aria-hidden="true">*</span>
            <select value={rating} onChange={(event) => setRating(event.target.value)}>
              <option value="">Choose a rating</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value} / 5
                </option>
              ))}
            </select>
          </label>
          <label>
            Comment <span>(optional)</span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={3}
            />
          </label>
          <button
            className="button button--primary"
            disabled={busy || rating === ''}
            onClick={() =>
              void submit(() =>
                api.submitFeedback(grievance.id, {
                  rating: Number(rating),
                  ...(comment.trim() ? { comment: comment.trim() } : {}),
                }),
              )
            }
          >
            {busy ? 'Sending feedback…' : 'Submit feedback and close case'}
          </button>
        </div>
      )}
      {ownsFeedback && !canFeedbackNow && (
        <p className="notice">The feedback period has ended. The case will close automatically.</p>
      )}
    </section>
  );
}
