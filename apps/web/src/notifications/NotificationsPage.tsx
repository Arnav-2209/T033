import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { NotificationItem, UserRole } from '@sgrs/contracts';
import { WorkspaceLayout } from '../grievances/WorkspaceLayout.js';
import { ApiClientError, api } from '../lib/api.js';
import { useAuth } from '../auth/AuthProvider.js';
import { roleRoutes } from '../auth/LoginPage.js';
import { ScrollReveal } from '../visual/ScrollReveal.js';

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function casePath(role: UserRole | undefined, id: string): string {
  const prefix = role === 'ADMINISTRATOR' ? 'admin' : (role?.toLowerCase() ?? 'student');
  return `/app/${prefix}/grievances/${id}`;
}

export function NotificationsPage(): ReactNode {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const response = await api.notifications({ page, pageSize });
      setItems(response.data.items);
      setUnreadCount(response.data.unreadCount);
      setTotal(response.data.total);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'Notifications could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [page]);

  async function markRead(item: NotificationItem): Promise<void> {
    if (item.readAt) return;
    try {
      await api.markNotificationRead(item.id);
      const readAt = new Date().toISOString();
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, readAt } : entry)),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'The notification could not be marked as read.',
      );
    }
  }

  return (
    <WorkspaceLayout
      role={user?.role ?? 'STUDENT'}
      eyebrow="PERSONAL INBOX · PRIVATE TO YOUR ACCOUNT"
      title="Notifications."
      introduction="Updates are saved to your account so you can review case activity when it suits you."
      actions={
        <Link className="button button--quiet" to={user ? roleRoutes[user.role] : '/'}>
          Back to workspace
        </Link>
      }
    >
      <ScrollReveal
        as="section"
        className="case-detail-panel"
        aria-labelledby="notifications-heading"
      >
        <div className="case-section__heading">
          <div>
            <p className="eyebrow">IN-APP UPDATES</p>
            <h2 id="notifications-heading">Your inbox</h2>
          </div>
          <span>
            {unreadCount} unread · {total} total
          </span>
        </div>
        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p role="status">Loading notifications…</p>
        ) : items.length ? (
          <ol className="notification-list">
            {items.map((item, index) => (
              <ScrollReveal
                as="li"
                key={item.id}
                className={item.readAt ? '' : 'notification-list__unread'}
                delay={(index % 4) * 0.06}
                distance={18}
              >
                <div>
                  <p className="eyebrow">{item.type.replaceAll('_', ' ')}</p>
                  <h3>{item.title}</h3>
                  {item.body && <p>{item.body}</p>}
                  <time dateTime={item.createdAt}>{dateTime(item.createdAt)}</time>
                </div>
                <div className="notification-list__actions">
                  {item.grievanceId && (
                    <Link to={casePath(user?.role, item.grievanceId)}>View case</Link>
                  )}
                  {!item.readAt && (
                    <button className="button button--quiet" onClick={() => void markRead(item)}>
                      Mark as read
                    </button>
                  )}
                  {item.readAt && <span>Read {dateTime(item.readAt)}</span>}
                </div>
              </ScrollReveal>
            ))}
          </ol>
        ) : (
          <p>No notifications yet.</p>
        )}
        <nav className="audit-pagination" aria-label="Notification pages">
          <button
            type="button"
            className="button button--quiet"
            disabled={loading || page <= 1}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous notifications
          </button>
          <button
            type="button"
            className="button button--quiet"
            disabled={loading || page * pageSize >= total}
            onClick={() => setPage((current) => current + 1)}
          >
            More notifications
          </button>
        </nav>
      </ScrollReveal>
    </WorkspaceLayout>
  );
}
