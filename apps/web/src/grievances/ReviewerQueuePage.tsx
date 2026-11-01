import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ReviewerQueueResponse } from '@sgrs/contracts';
import { ApiClientError, api } from '../lib/api.js';
import { WorkspaceLayout } from './WorkspaceLayout.js';
import { ScrollReveal } from '../visual/ScrollReveal.js';

export function ReviewerQueuePage(): ReactNode {
  const [items, setItems] = useState<ReviewerQueueResponse['data']['items']>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .reviewerQueue({ q: query })
      .then((result) => {
        if (active) setItems(result.data.items);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof ApiClientError
              ? caught.message
              : 'The reviewer queue could not be loaded.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query]);
  return (
    <WorkspaceLayout
      role="REVIEWER"
      eyebrow="REVIEW DESK · ASSIGNED ESCALATIONS"
      title="Cases requiring your review."
      introduction="This queue is limited to escalation levels assigned to your reviewer account. Case history, evidence and staff-only remarks remain inside the authorized record."
    >
      <ScrollReveal as="section" className="case-section" aria-labelledby="review-queue-heading">
        <div className="case-section__heading">
          <div>
            <p className="eyebrow">ESCALATED CASES</p>
            <h2 id="review-queue-heading">Your review queue</h2>
          </div>
          <span>{items.length} cases</span>
        </div>
        <div className="queue-filters">
          <label>
            Search escalations
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Case number, title or category"
            />
          </label>
        </div>
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p className="case-loading" role="status">
            Loading assigned escalations…
          </p>
        ) : items.length ? (
          <div className="grievance-grid">
            {items.map((item, index) => (
              <ScrollReveal
                as="article"
                className="grievance-card"
                key={item.escalationLevel.id}
                delay={(index % 3) * 0.08}
                distance={22}
              >
                <div className="grievance-card__top">
                  <span className="status-pill">LEVEL {item.escalationLevel.level}</span>
                  <span className="grievance-card__date">{item.caseNumber}</span>
                </div>
                <h3>{item.title ?? 'Untitled grievance'}</h3>
                <p className="grievance-card__meta">
                  {item.categoryName ?? 'Category'} ·{' '}
                  {item.escalationLevel.reasonType.replaceAll('_', ' ')}
                </p>
                <p>{item.escalationLevel.reason}</p>
                <div className="grievance-card__footer">
                  <span>{item.escalationLevel.state.replaceAll('_', ' ')}</span>
                  <strong>
                    Deadline{' '}
                    {item.resolutionDeadline
                      ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(
                          new Date(item.resolutionDeadline),
                        )
                      : 'Not set'}
                  </strong>
                </div>
                <Link className="grievance-card__link" to={'/app/reviewer/grievances/' + item.id}>
                  Review case file <span aria-hidden="true">↗</span>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        ) : (
          <div className="case-empty">
            <span className="case-empty__index">—</span>
            <div>
              <h3>No assigned escalations</h3>
              <p>Escalations assigned to your reviewer level will appear here.</p>
            </div>
          </div>
        )}
      </ScrollReveal>
    </WorkspaceLayout>
  );
}
