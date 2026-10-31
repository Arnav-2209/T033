import type { ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { UserRole } from '@sgrs/contracts';
import { useAuth } from '../auth/AuthProvider.js';
import { roleRoutes } from '../auth/LoginPage.js';
import { useEffect, useState } from 'react';
import { api, ApiClientError } from '../lib/api.js';

const roleLabels: Record<UserRole, string> = {
  STUDENT: 'Student',
  HANDLER: 'Grievance Handler',
  REVIEWER: 'Department / Committee Reviewer',
  ADMINISTRATOR: 'Administrator',
  MANAGEMENT: 'Institute Management',
};

export function RoleHomePage({ role }: { role: UserRole }): ReactNode {
  const { user, logout } = useAuth();
  const [manual, setManual] = useState<
    Array<{
      id: string;
      caseNumber: string | null;
      title: string | null;
      escalationLevel: { id: string; level: number; reason: string };
    }>
  >([]);
  const [reviewers, setReviewers] = useState<Array<{ id: string; name: string; email: string }>>(
    [],
  );
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  useEffect(() => {
    if (role !== 'ADMINISTRATOR') return;
    Promise.all([api.manualAssignments(), api.reviewers()])
      .then(([assignments, people]) => {
        setManual(assignments.data.items);
        setReviewers(people.data.items);
      })
      .catch((caught: unknown) =>
        setAssignmentError(
          caught instanceof ApiClientError
            ? caught.message
            : 'Manual reviewer assignments could not be loaded.',
        ),
      );
  }, [role]);
  if (!user) return null;

  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <Link className="wordmark" to={roleRoutes[user.role]} aria-label="SGRS home">
          SGRS<span> / {roleLabels[user.role]}</span>
        </Link>
        <div className="workspace-header__account">
          <div>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <button className="button button--quiet" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>
      <section className="workspace-intro">
        <p className="eyebrow">PRIVATE WORKSPACE · {roleLabels[role].toUpperCase()}</p>
        <h1>Your SGRS desk.</h1>
        <p>
          You are signed in as <strong>{user.name}</strong>. This authenticated workspace is ready;
          case handling and reporting arrive in their approved milestones.
        </p>
      </section>
      <section className="workspace-card" aria-labelledby="workspace-title">
        <div>
          <p className="eyebrow">ACCOUNT</p>
          <h2 id="workspace-title">Your access is verified.</h2>
          <p>
            Your permissions come from your account role, checked by the API on every protected
            request. The browser cannot select or elevate that role.
          </p>
        </div>
        <dl className="account-facts">
          <div>
            <dt>Name</dt>
            <dd>{user.name}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Role</dt>
            <dd>{roleLabels[user.role]}</dd>
          </div>
        </dl>
        {user.role === 'ADMINISTRATOR' && (
          <Link className="button button--primary" to="/app/admin/users">
            Manage accounts <span aria-hidden="true">↗</span>
          </Link>
        )}
      </section>
      {role === 'ADMINISTRATOR' && (
        <section className="case-section" aria-labelledby="manual-review-heading">
          <div className="case-section__heading">
            <div>
              <p className="eyebrow">ESCALATION ROUTING</p>
              <h2 id="manual-review-heading">Manual reviewer assignment</h2>
            </div>
            <span>{manual.length} waiting</span>
          </div>
          {assignmentError && (
            <p className="notice notice--error" role="alert">
              {assignmentError}
            </p>
          )}
          {manual.length ? (
            <div className="manual-assignment-list">
              {manual.map((item) => (
                <article key={item.escalationLevel.id}>
                  <div>
                    <strong>
                      {item.caseNumber} · Level {item.escalationLevel.level}
                    </strong>
                    <p>
                      {item.title} — {item.escalationLevel.reason}
                    </p>
                  </div>
                  <label>
                    Assign reviewer
                    <select
                      defaultValue=""
                      onChange={(event) => {
                        if (!event.target.value) return;
                        void api
                          .assignReviewer(item.escalationLevel.id, event.target.value)
                          .then(() =>
                            setManual((current) =>
                              current.filter(
                                (entry) => entry.escalationLevel.id !== item.escalationLevel.id,
                              ),
                            ),
                          )
                          .catch((caught: unknown) =>
                            setAssignmentError(
                              caught instanceof ApiClientError
                                ? caught.message
                                : 'Reviewer assignment failed.',
                            ),
                          );
                      }}
                    >
                      <option value="" disabled>
                        Choose an active reviewer
                      </option>
                      {reviewers.map((reviewer) => (
                        <option value={reviewer.id} key={reviewer.id}>
                          {reviewer.name} · {reviewer.email}
                        </option>
                      ))}
                    </select>
                  </label>
                </article>
              ))}
            </div>
          ) : (
            <p>
              {role === 'ADMINISTRATOR' && !assignmentError
                ? 'No escalations are waiting for manual reviewer assignment.'
                : null}
            </p>
          )}
        </section>
      )}
    </main>
  );
}

export function AppIndexRedirect(): ReactNode {
  const { user } = useAuth();
  return user ? <Navigate to={roleRoutes[user.role]} replace /> : null;
}
