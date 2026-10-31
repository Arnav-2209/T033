import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { userRoles, type PublicUser, type UserRole } from '@sgrs/contracts';
import { useAuth } from '../auth/AuthProvider.js';
import { ApiClientError, api } from '../lib/api.js';
import { roleRoutes } from '../auth/LoginPage.js';

const roleLabels: Record<UserRole, string> = {
  STUDENT: 'Student',
  HANDLER: 'Handler',
  REVIEWER: 'Reviewer',
  ADMINISTRATOR: 'Administrator',
  MANAGEMENT: 'Management',
};

export function AdminUsersPage(): ReactNode {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    email: '',
    name: '',
    initialPassword: '',
    role: 'STUDENT' as UserRole,
  });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.listUsers(appliedQuery);
      setUsers(response.data.items);
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Accounts could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [appliedQuery]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function updateUser(
    id: string,
    changes: Parameters<typeof api.updateUser>[1],
  ): Promise<void> {
    setError(null);
    setNotice(null);
    try {
      const response = await api.updateUser(id, changes);
      setUsers((current) => current.map((item) => (item.id === id ? response.data : item)));
      setNotice('Account changes saved. Affected sessions were revoked where required.');
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'The account could not be updated.',
      );
    }
  }

  async function createUser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const response = await api.createUser(form);
      setUsers((current) =>
        [...current, response.data].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setForm({ email: '', name: '', initialPassword: '', role: 'STUDENT' });
      setShowCreate(false);
      setNotice(
        'Account created. Share its initial password with the account holder through an approved channel.',
      );
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'The account could not be created.',
      );
    }
  }

  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <Link className="wordmark" to={roleRoutes.ADMINISTRATOR}>
          SGRS<span> / Access register</span>
        </Link>
        <div className="workspace-header__account">
          <div>
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
          </div>
          <button className="button button--quiet" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>
      <section className="workspace-intro workspace-intro--compact">
        <p className="eyebrow">ADMINISTRATION · ACCOUNT LIFECYCLE</p>
        <h1>Access register.</h1>
        <p>
          Create accounts, assign a role and deactivate access when required. Every change is
          recorded in the audit log.
        </p>
      </section>

      <section className="user-register" aria-labelledby="register-title">
        <div className="user-register__toolbar">
          <div>
            <p className="eyebrow">DIRECTORY</p>
            <h2 id="register-title">Accounts</h2>
          </div>
          <form
            className="user-search"
            onSubmit={(event) => {
              event.preventDefault();
              setAppliedQuery(query);
            }}
          >
            <label className="visually-hidden" htmlFor="account-search">
              Search accounts
            </label>
            <input
              id="account-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or email"
            />
            <button className="button button--quiet">Search</button>
          </form>
          <button
            className="button button--primary"
            onClick={() => setShowCreate((visible) => !visible)}
          >
            {showCreate ? 'Cancel' : 'Add account'}{' '}
            <span aria-hidden="true">{showCreate ? '−' : '+'}</span>
          </button>
        </div>

        {error && (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}

        {showCreate && (
          <form className="create-user-form" onSubmit={createUser}>
            <h3>New account</h3>
            <div className="form-grid">
              <label>
                Name
                <input
                  required
                  maxLength={160}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </label>
              <label>
                Email
                <input
                  required
                  type="email"
                  maxLength={320}
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </label>
              <label>
                Role
                <select
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
                >
                  {userRoles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabels[role]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Initial password
                <input
                  required
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  value={form.initialPassword}
                  onChange={(event) => setForm({ ...form, initialPassword: event.target.value })}
                />
                <small>At least 12 characters; choose a local-only demo password.</small>
              </label>
            </div>
            <button className="button button--primary">Create account</button>
          </form>
        )}

        {loading ? (
          <p className="table-message" aria-live="polite">
            Loading accounts…
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="visually-hidden">SGRS accounts and access settings</caption>
              <thead>
                <tr>
                  <th scope="col">Account</th>
                  <th scope="col">Role</th>
                  <th scope="col">Access</th>
                  <th scope="col">Change</th>
                </tr>
              </thead>
              <tbody>
                {users.map((account) => (
                  <UserRow key={account.id} account={account} onUpdate={updateUser} />
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4}>No accounts match this search.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="register-note">
          Passwords and session tokens are never shown. Role or activation changes revoke existing
          sessions.
        </p>
      </section>
    </main>
  );
}

function UserRow({
  account,
  onUpdate,
}: {
  account: PublicUser;
  onUpdate(id: string, changes: Parameters<typeof api.updateUser>[1]): Promise<void>;
}): ReactNode {
  const [role, setRole] = useState(account.role);
  const roleChanged = role !== account.role;
  return (
    <tr>
      <td>
        <strong>{account.name}</strong>
        <span className="account-email">{account.email}</span>
      </td>
      <td>
        <label className="visually-hidden" htmlFor={`role-${account.id}`}>
          Role for {account.name}
        </label>
        <select
          id={`role-${account.id}`}
          value={role}
          onChange={(event) => setRole(event.target.value as UserRole)}
        >
          {userRoles.map((option) => (
            <option key={option} value={option}>
              {roleLabels[option]}
            </option>
          ))}
        </select>
      </td>
      <td>
        <span className={`access-state ${account.isActive ? 'is-active' : 'is-inactive'}`}>
          {account.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="row-actions">
        {roleChanged && (
          <button className="text-action" onClick={() => void onUpdate(account.id, { role })}>
            Save role
          </button>
        )}
        <button
          className="text-action"
          onClick={() => void onUpdate(account.id, { isActive: !account.isActive })}
        >
          {account.isActive ? 'Deactivate' : 'Activate'}
        </button>
      </td>
    </tr>
  );
}
