import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider.js';
import { roleRoutes } from '../auth/LoginPage.js';
import type { UserRole } from '@sgrs/contracts';

const roleLabels: Record<UserRole, string> = {
  STUDENT: 'Student',
  HANDLER: 'Grievance Handler',
  REVIEWER: 'Department / Committee Reviewer',
  ADMINISTRATOR: 'Administrator',
  MANAGEMENT: 'Institute Management',
};

export function WorkspaceLayout(props: {
  role: UserRole;
  eyebrow: string;
  title: string;
  introduction: string;
  children: ReactNode;
  actions?: ReactNode;
}): ReactNode {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <main className="case-workspace">
      <header className="case-workspace__header">
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
      <section className="case-workspace__intro">
        <div>
          <p className="eyebrow">{props.eyebrow}</p>
          <h1>{props.title}</h1>
          <p>{props.introduction}</p>
        </div>
        {props.actions && <div className="case-workspace__actions">{props.actions}</div>}
      </section>
      {props.children}
    </main>
  );
}
