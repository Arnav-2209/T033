import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserRole } from '@sgrs/contracts';
import { ApiClientError } from '../lib/api.js';
import { useAuth } from './AuthProvider.js';

const demoAccounts: Array<{ role: UserRole; label: string; email: string }> = [
  { role: 'STUDENT', label: 'Student', email: 'aditi.rao@student.demo.sgrs.local' },
  { role: 'HANDLER', label: 'Handler', email: 'ramesh.kumar@staff.demo.sgrs.local' },
  { role: 'REVIEWER', label: 'Reviewer', email: 'hostel.committee@staff.demo.sgrs.local' },
  { role: 'ADMINISTRATOR', label: 'Administrator', email: 'admin@demo.sgrs.local' },
  { role: 'MANAGEMENT', label: 'Management', email: 'management@demo.sgrs.local' },
];

export const roleRoutes: Record<UserRole, string> = {
  STUDENT: '/app/student',
  HANDLER: '/app/handler',
  REVIEWER: '/app/reviewer',
  ADMINISTRATOR: '/app/admin',
  MANAGEMENT: '/app/management',
};

export function LoginPage(): ReactNode {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const role = await login(email, password);
      navigate(roleRoutes[role], { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiClientError && caught.status === 429
          ? 'Too many sign-in attempts. Please wait and try again.'
          : caught instanceof ApiClientError && caught.status === 401
            ? 'Email or password is incorrect.'
            : 'Sign-in could not be completed. Please try again shortly.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story" aria-labelledby="login-title">
        <img
          className="login-brand"
          src="/lnmiit-logo.png"
          alt="The LNM Institute of Information Technology, Jaipur"
        />
        <p className="eyebrow">THE LNM INSTITUTE OF INFORMATION TECHNOLOGY · JAIPUR</p>
        <div className="login-story__content">
          <p className="story-index">A considered process for raising a concern</p>
          <h1 id="login-title">Every concern deserves a clear path forward.</h1>
          <p className="login-story__copy">
            Sign in to follow the people, decisions and next steps connected to your SGRS account.
          </p>
        </div>
        <div className="login-story__footer">
          <span>Student Grievance Redressal System</span>
          <span>CS314 · T033</span>
        </div>
      </section>

      <section className="login-panel" aria-label="Sign in">
        <div className="login-panel__inner">
          <p className="eyebrow login-panel__eyebrow">ACCOUNT ACCESS</p>
          <h2>Welcome back.</h2>
          <p className="login-panel__intro">Use the email and password attached to your account.</p>

          <form className="login-form" onSubmit={onSubmit}>
            <label htmlFor="login-email">Email address</label>
            <input
              id="login-email"
              autoComplete="username"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button button--primary login-submit" disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign in'}
              <span aria-hidden="true">↗</span>
            </button>
          </form>

          <details className="demo-access">
            <summary>Choose a demo account</summary>
            <p>Choose an email to fill the form. Authentication still requires its password.</p>
            <div className="demo-account-list">
              {demoAccounts.map((account) => (
                <button
                  type="button"
                  className="demo-account"
                  key={account.role}
                  onClick={() => setEmail(account.email)}
                >
                  <span>{account.label}</span>
                  <span className="demo-account__arrow" aria-hidden="true">
                    ↗
                  </span>
                  <small>{account.email}</small>
                </button>
              ))}
            </div>
          </details>
          <p className="login-note">
            Local demonstration accounts only · No institute SSO is connected.
          </p>
        </div>
      </section>
    </main>
  );
}
