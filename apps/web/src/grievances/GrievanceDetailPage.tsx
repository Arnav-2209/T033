import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { GrievanceDetail } from '@sgrs/contracts';
import { useAuth } from '../auth/AuthProvider.js';
import { ApiClientError, api } from '../lib/api.js';
import { WorkspaceLayout } from './WorkspaceLayout.js';

const statusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  PENDING_MANUAL_ASSIGNMENT: 'Pending manual assignment',
  ASSIGNED: 'Assigned to handler',
  UNDER_REVIEW: 'Under review',
  AWAITING_INFORMATION: 'Awaiting information',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  WITHDRAWN: 'Withdrawn',
};

function dateTime(value: string | null): string {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function dateOnly(value: string | null): string {
  if (!value) return 'Not set';
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}

export function GrievanceDetailPage(): ReactNode {
  const { grievanceId } = useParams();
  const { user } = useAuth();
  const [grievance, setGrievance] = useState<GrievanceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [activeRequestId, setActiveRequestId] = useState('');

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
              : 'The case record could not be loaded.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [grievanceId]);

  async function withdraw(): Promise<void> {
    if (
      !grievance ||
      !window.confirm(
        'Withdraw this grievance? The case will stop moving through the active process.',
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const response = await api.withdrawGrievance(grievance.id);
      setGrievance(response.data);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'This grievance could not be withdrawn.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function runWorkflow(action: () => Promise<{ data: GrievanceDetail }>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      setGrievance((await action()).data);
      setMessageBody('');
      setEscalationReason('');
      setActiveRequestId('');
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'The workflow action could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  }

  const studentCanEdit =
    user?.role === 'STUDENT' &&
    grievance !== null &&
    ['DRAFT', 'PENDING_MANUAL_ASSIGNMENT'].includes(grievance.status);
  const studentCanWithdraw =
    user?.role === 'STUDENT' &&
    grievance !== null &&
    !['RESOLVED', 'CLOSED', 'WITHDRAWN'].includes(grievance.status);

  return (
    <WorkspaceLayout
      role={user?.role ?? 'STUDENT'}
      eyebrow="CASE RECORD · AUTHORIZED ACCESS ONLY"
      title={grievance?.caseNumber ?? 'Grievance details'}
      introduction={grievance?.title ?? 'The case details and status history are shown below.'}
      actions={
        <>
          <Link
            className="button button--quiet"
            to={user?.role === 'HANDLER' ? '/app/handler' : '/app/student'}
          >
            Back to cases
          </Link>
          {studentCanEdit && (
            <Link
              className="button button--primary"
              to={'/app/student/grievances/' + (grievance?.id ?? '') + '/edit'}
            >
              {grievance?.status === 'DRAFT' ? 'Continue draft' : 'Edit details'}
            </Link>
          )}
        </>
      }
    >
      {loading ? (
        <p className="case-loading" role="status">
          Loading the authorized case record…
        </p>
      ) : error && !grievance ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : grievance ? (
        <>
          {error && (
            <p className="notice notice--error" role="alert">
              {error}
            </p>
          )}
          <section className="case-detail-hero">
            <div>
              <span className={'status-pill status-pill--' + grievance.status.toLowerCase()}>
                {statusLabels[grievance.status] ?? grievance.status}
              </span>
              <p className="eyebrow">CURRENT STATUS</p>
              <h2>{statusLabels[grievance.status] ?? grievance.status}</h2>
              <p>
                {grievance.status === 'PENDING_MANUAL_ASSIGNMENT'
                  ? 'The category has no currently eligible primary handler. An administrator has been notified to assign this case.'
                  : grievance.assignedHandlerName
                    ? 'Assigned to ' + grievance.assignedHandlerName
                    : 'Your case history and next steps are recorded here.'}
              </p>
            </div>
            <dl className="case-deadline">
              <div>
                <dt>Submitted</dt>
                <dd>{dateTime(grievance.submittedAt)}</dd>
              </div>
              <div>
                <dt>Target deadline</dt>
                <dd>{dateTime(grievance.resolutionDeadline)}</dd>
              </div>
              {grievance.slaHoursSnapshot !== null && (
                <div>
                  <dt>Configured SLA at submission</dt>
                  <dd>{grievance.slaHoursSnapshot} hours</dd>
                </div>
              )}
            </dl>
          </section>

          <div className="case-detail-grid">
            <section className="case-detail-panel" aria-labelledby="case-details-heading">
              <p className="eyebrow">THE REPORT</p>
              <h2 id="case-details-heading">Case details</h2>
              <dl className="case-facts">
                <div>
                  <dt>Category</dt>
                  <dd>{grievance.categoryName ?? 'Not selected'}</dd>
                </div>
                <div>
                  <dt>Incident date</dt>
                  <dd>{dateOnly(grievance.incidentDate)}</dd>
                </div>
                <div>
                  <dt>Location / department</dt>
                  <dd>{grievance.location || 'Not provided'}</dd>
                </div>
                <div>
                  <dt>Priority</dt>
                  <dd>{grievance.priority === 'HIGH' ? 'High' : 'Normal'}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{dateTime(grievance.createdAt)}</dd>
                </div>
              </dl>
              <h3>Description</h3>
              <p className="case-description">
                {grievance.description || 'No description saved yet.'}
              </p>
              {user?.role === 'HANDLER' && (
                <section className="workflow-panel" aria-labelledby="handler-actions-heading">
                  <p className="eyebrow">INVESTIGATION</p>
                  <h3 id="handler-actions-heading">Case actions</h3>
                  {grievance.status === 'ASSIGNED' && (
                    <button
                      className="button button--primary"
                      disabled={busy}
                      onClick={() => void runWorkflow(() => api.startHandlerReview(grievance.id))}
                    >
                      Start investigation
                    </button>
                  )}
                  {grievance.status === 'UNDER_REVIEW' && (
                    <>
                      <label>
                        Internal investigation remark
                        <textarea
                          value={messageBody}
                          onChange={(event) => setMessageBody(event.target.value)}
                          rows={3}
                        />
                      </label>
                      <button
                        className="button button--quiet"
                        disabled={busy || !messageBody.trim()}
                        onClick={() =>
                          void runWorkflow(() => api.addHandlerNote(grievance.id, messageBody))
                        }
                      >
                        Add internal remark
                      </button>
                      <label>
                        Request information from student
                        <textarea
                          value={messageBody}
                          onChange={(event) => setMessageBody(event.target.value)}
                          rows={3}
                        />
                      </label>
                      <button
                        className="button button--primary"
                        disabled={busy || !messageBody.trim()}
                        onClick={() =>
                          void runWorkflow(() => api.requestInformation(grievance.id, messageBody))
                        }
                      >
                        Send information request
                      </button>
                      <label>
                        Reason for manual escalation
                        <textarea
                          value={escalationReason}
                          onChange={(event) => setEscalationReason(event.target.value)}
                          rows={2}
                        />
                      </label>
                      <button
                        className="button button--quiet"
                        disabled={busy || !escalationReason.trim()}
                        onClick={() =>
                          void runWorkflow(() => api.escalate(grievance.id, escalationReason))
                        }
                      >
                        Escalate to reviewer
                      </button>
                    </>
                  )}
                </section>
              )}
              {studentCanWithdraw && (
                <button
                  className="button button--danger-quiet"
                  disabled={busy}
                  onClick={() => void withdraw()}
                >
                  {busy ? 'Withdrawing…' : 'Withdraw grievance'}
                </button>
              )}
            </section>

            <aside className="case-detail-panel" aria-labelledby="evidence-heading">
              <p className="eyebrow">ATTACHMENTS</p>
              <h2 id="evidence-heading">Supporting evidence</h2>
              {grievance.evidence.length ? (
                <ul className="evidence-list evidence-list--detail">
                  {grievance.evidence.map((file) => (
                    <li key={file.id}>
                      <a href={api.evidenceUrl(grievance.id, file.id)}>{file.originalName}</a>
                      <span>{(file.sizeBytes / (1024 * 1024)).toFixed(2)} MiB</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No evidence attached.</p>
              )}
            </aside>

            <section
              className="case-detail-panel case-detail-panel--wide"
              aria-labelledby="history-heading"
            >
              <p className="eyebrow">A RECORDED PROCESS</p>
              <h2 id="history-heading">Status history</h2>
              {grievance.statusHistory.length ? (
                <ol className="status-timeline">
                  {grievance.statusHistory.map((event) => (
                    <li key={event.id}>
                      <span className="status-timeline__marker" aria-hidden="true" />
                      <div>
                        <strong>
                          {event.previousStatus
                            ? statusLabels[event.previousStatus] +
                              ' → ' +
                              statusLabels[event.newStatus]
                            : statusLabels[event.newStatus]}
                        </strong>
                        <time dateTime={event.occurredAt}>{dateTime(event.occurredAt)}</time>
                        {event.publicNote && <p>{event.publicNote}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>Status events will appear here as your case moves through the process.</p>
              )}
            </section>
            <section
              className="case-detail-panel case-detail-panel--wide"
              aria-labelledby="messages-heading"
            >
              <p className="eyebrow">CHRONOLOGICAL CASE FILE</p>
              <h2 id="messages-heading">Case conversation and staff notes</h2>
              {grievance.messages.length ? (
                <ol className="message-timeline">
                  {grievance.messages.map((message) => (
                    <li
                      key={message.id}
                      className={
                        message.audience === 'STAFF_ONLY' ? 'message-timeline__internal' : ''
                      }
                    >
                      <div>
                        <strong>{message.messageType.replaceAll('_', ' ')}</strong>
                        <span>
                          {message.authorName} · {dateTime(message.createdAt)}
                        </span>
                      </div>
                      <p>{message.body}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p>No messages or investigation remarks yet.</p>
              )}
              {user?.role === 'STUDENT' && grievance.status === 'AWAITING_INFORMATION' && (
                <div className="workflow-panel">
                  <h3>Respond to an information request</h3>
                  {grievance.messages
                    .filter((message) => message.messageType === 'INFO_REQUEST')
                    .map((message) => (
                      <label key={message.id}>
                        <span>Response to request · {dateTime(message.createdAt)}</span>
                        <textarea
                          value={activeRequestId === message.id ? messageBody : ''}
                          onFocus={() => setActiveRequestId(message.id)}
                          onChange={(event) => {
                            setActiveRequestId(message.id);
                            setMessageBody(event.target.value);
                          }}
                          rows={3}
                        />
                      </label>
                    ))}
                  <button
                    className="button button--primary"
                    disabled={busy || !messageBody.trim() || !activeRequestId}
                    onClick={() =>
                      void runWorkflow(() =>
                        api.respondToInformation(grievance.id, activeRequestId, messageBody),
                      )
                    }
                  >
                    Send response
                  </button>
                </div>
              )}
              {user?.role === 'HANDLER' && grievance.escalationLevels.length > 0 && (
                <div className="workflow-panel">
                  <p className="eyebrow">ESCALATION RECORD</p>
                  <h3>Review levels</h3>
                  {grievance.escalationLevels.map((level) => (
                    <p key={level.id}>
                      Level {level.level} · {level.state.replaceAll('_', ' ')} ·{' '}
                      {level.reviewerName ?? 'Awaiting manual reviewer assignment'} · {level.reason}
                    </p>
                  ))}
                </div>
              )}
              {user?.role === 'REVIEWER' && (
                <div className="workflow-panel">
                  <p className="eyebrow">REVIEWER ACTIONS</p>
                  <h3>Escalation levels</h3>
                  {grievance.escalationLevels.map((level) => (
                    <p key={level.id}>
                      Level {level.level} · {level.state.replaceAll('_', ' ')} ·{' '}
                      {level.reviewerName ?? 'Awaiting manual reviewer assignment'}
                    </p>
                  ))}
                  {grievance.escalationLevels.some(
                    (level) => level.reviewerId === user.id && level.state === 'REVIEWER_ASSIGNED',
                  ) && (
                    <button
                      className="button button--primary"
                      disabled={busy}
                      onClick={() => {
                        const level = grievance.escalationLevels.find(
                          (item) =>
                            item.reviewerId === user.id && item.state === 'REVIEWER_ASSIGNED',
                        );
                        if (level)
                          void runWorkflow(() =>
                            api.startReviewerHandling(grievance.id, level.level),
                          );
                      }}
                    >
                      Begin reviewer handling
                    </button>
                  )}
                  {grievance.escalationLevels.some(
                    (level) =>
                      level.reviewerId === user.id && level.state === 'UNDER_REVIEWER_HANDLING',
                  ) && (
                    <>
                      <label>
                        Direction for the handler
                        <textarea
                          value={messageBody}
                          onChange={(event) => setMessageBody(event.target.value)}
                          rows={3}
                        />
                      </label>
                      <button
                        className="button button--primary"
                        disabled={busy || !messageBody.trim()}
                        onClick={() =>
                          void runWorkflow(() =>
                            api.addReviewerDirection(grievance.id, messageBody),
                          )
                        }
                      >
                        Record direction
                      </button>
                      <label>
                        Reason for further escalation
                        <textarea
                          value={escalationReason}
                          onChange={(event) => setEscalationReason(event.target.value)}
                          rows={2}
                        />
                      </label>
                      <button
                        className="button button--quiet"
                        disabled={busy || !escalationReason.trim()}
                        onClick={() =>
                          void runWorkflow(() =>
                            api.escalateFurther(grievance.id, escalationReason),
                          )
                        }
                      >
                        Escalate to next level
                      </button>
                    </>
                  )}
                </div>
              )}
            </section>
          </div>
        </>
      ) : null}
    </WorkspaceLayout>
  );
}
