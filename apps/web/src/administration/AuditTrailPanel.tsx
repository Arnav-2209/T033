import { useEffect, useState, type ReactNode } from 'react';
import type { AuditEventItem } from '@sgrs/contracts';
import { ApiClientError, api } from '../lib/api.js';

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

export function AuditTrailPanel({ grievanceId }: { grievanceId: string }): ReactNode {
  const [items, setItems] = useState<AuditEventItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 25;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .auditTrail(grievanceId, { page, pageSize })
      .then((response) => {
        if (active) {
          setItems(response.data.items);
          setTotal(response.data.total);
        }
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof ApiClientError
              ? caught.message
              : 'The audit trail could not be loaded.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [grievanceId, page]);

  return (
    <section
      className="case-detail-panel case-detail-panel--wide"
      aria-labelledby="audit-trail-heading"
    >
      <p className="eyebrow">ADMINISTRATOR VIEW · APPEND-ONLY EVENTS</p>
      <h2 id="audit-trail-heading">Audit trail</h2>
      <p>
        {total} events · Page {page}
      </p>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading audit events…</p>
      ) : items.length ? (
        <ol className="status-timeline">
          {items.map((event) => (
            <li key={event.id}>
              <span className="status-timeline__marker" aria-hidden="true" />
              <div>
                <strong>{event.action.replaceAll('_', ' ')}</strong>
                <time dateTime={event.occurredAt}>{dateTime(event.occurredAt)}</time>
                <p>
                  {event.actorName ?? 'System'}
                  {event.actorRole ? ` · ${event.actorRole}` : ''} · {event.source}
                </p>
                <details>
                  <summary>Event details</summary>
                  <pre>{JSON.stringify(event.details, null, 2)}</pre>
                </details>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p>No audit events are recorded for this grievance.</p>
      )}
      <nav className="audit-pagination" aria-label="Audit trail pages">
        <button
          type="button"
          className="button button--quiet"
          disabled={loading || page <= 1}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          Previous events
        </button>
        <button
          type="button"
          className="button button--quiet"
          disabled={loading || page * pageSize >= total}
          onClick={() => setPage((current) => current + 1)}
        >
          More events
        </button>
      </nav>
    </section>
  );
}
