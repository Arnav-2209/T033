import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { CategoryAdminItem, StaffDirectoryItem } from '@sgrs/contracts';
import { useAuth } from '../auth/AuthProvider.js';
import { roleRoutes } from '../auth/LoginPage.js';
import { ApiClientError, api } from '../lib/api.js';
import { ScrollReveal } from '../visual/ScrollReveal.js';

function MappingEditor(props: {
  category: CategoryAdminItem;
  staff: StaffDirectoryItem[];
  onAdd: (categoryId: string, input: { handlerId: string; isPrimary: boolean }) => Promise<void>;
  onEnd: (categoryId: string, mappingId: string) => Promise<void>;
  onPrimary: (categoryId: string, mappingId: string) => Promise<void>;
}) {
  const [handlerId, setHandlerId] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const handlers = props.staff.filter((person) => person.role === 'HANDLER' && person.isActive);
  return (
    <section
      className="admin-config-section"
      aria-label={`Handler mapping for ${props.category.name}`}
    >
      <h3>Handler mapping</h3>
      {props.category.handlers.length ? (
        <ul className="admin-mapping-list">
          {props.category.handlers.map((mapping) => (
            <li key={mapping.id}>
              <span>
                {mapping.handlerName} · {mapping.handlerEmail}
                {mapping.isPrimary ? ' · Primary route' : ''}
              </span>
              <div>
                {!mapping.isPrimary && (
                  <button
                    className="button button--quiet"
                    onClick={() => void props.onPrimary(props.category.id, mapping.id)}
                  >
                    Make primary
                  </button>
                )}
                <button
                  className="button button--quiet"
                  onClick={() => void props.onEnd(props.category.id, mapping.id)}
                >
                  End mapping
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>No active handlers mapped. Submissions will enter the manual assignment queue.</p>
      )}
      <form
        className="inline-config-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (handlerId)
            void props
              .onAdd(props.category.id, { handlerId, isPrimary })
              .then(() => setHandlerId(''));
        }}
      >
        <label>
          Active handler
          <select required value={handlerId} onChange={(event) => setHandlerId(event.target.value)}>
            <option value="">Choose a handler</option>
            {handlers.map((handler) => (
              <option key={handler.id} value={handler.id}>
                {handler.name} · {handler.email}
              </option>
            ))}
          </select>
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={isPrimary}
            onChange={(event) => setIsPrimary(event.target.checked)}
          />{' '}
          Make primary route
        </label>
        <button className="button button--quiet" disabled={!handlerId}>
          Add handler mapping
        </button>
      </form>
    </section>
  );
}

function RuleEditor(props: {
  category: CategoryAdminItem;
  staff: StaffDirectoryItem[];
  onSave: (
    categoryId: string,
    input: {
      level: number;
      reviewerId: string | null;
      timelineHours: number | null;
      isActive: boolean;
    },
  ) => Promise<void>;
}) {
  const [level, setLevel] = useState('1');
  const [reviewerId, setReviewerId] = useState('');
  const [timelineHours, setTimelineHours] = useState('');
  const [isActive, setIsActive] = useState(true);
  const reviewers = props.staff.filter((person) => person.role === 'REVIEWER' && person.isActive);
  return (
    <section
      className="admin-config-section"
      aria-label={`Escalation rules for ${props.category.name}`}
    >
      <h3>Escalation rules</h3>
      {props.category.escalationRules.length ? (
        <ul className="admin-mapping-list">
          {props.category.escalationRules.map((rule) => (
            <li key={rule.id}>
              <span>
                Level {rule.level} · {rule.reviewerName ?? 'Manual assignment'} ·{' '}
                {rule.timelineHours ? `${rule.timelineHours} hours` : 'No timeline configured'} ·{' '}
                {rule.isActive ? 'Active' : 'Inactive'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>No escalation rules configured.</p>
      )}
      <form
        className="inline-config-form"
        onSubmit={(event) => {
          event.preventDefault();
          void props.onSave(props.category.id, {
            level: Number(level),
            reviewerId: reviewerId || null,
            timelineHours: timelineHours ? Number(timelineHours) : null,
            isActive,
          });
        }}
      >
        <label>
          Level
          <input
            required
            type="number"
            min="1"
            max="20"
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          />
        </label>
        <label>
          Reviewer
          <select value={reviewerId} onChange={(event) => setReviewerId(event.target.value)}>
            <option value="">Manual assignment</option>
            {reviewers.map((reviewer) => (
              <option key={reviewer.id} value={reviewer.id}>
                {reviewer.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Timeline hours (optional)
          <input
            type="number"
            min="1"
            max="8760"
            value={timelineHours}
            onChange={(event) => setTimelineHours(event.target.value)}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />{' '}
          Rule active
        </label>
        <button className="button button--quiet">Save level</button>
      </form>
    </section>
  );
}

export function CategoryManagementPage(): ReactNode {
  const { user, logout } = useAuth();
  const [categories, setCategories] = useState<CategoryAdminItem[]>([]);
  const [staff, setStaff] = useState<StaffDirectoryItem[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [slaHours, setSlaHours] = useState('120');
  const [directorySearch, setDirectorySearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [categoryResponse, directoryResponse] = await Promise.all([
        api.adminCategories(),
        api.adminDirectory(),
      ]);
      setCategories(categoryResponse.data.items);
      setStaff(directoryResponse.data.items);
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Category configuration could not be loaded.',
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<{ data: CategoryAdminItem }>): Promise<void> {
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      setCategories((items) =>
        items.map((category) => (category.id === result.data.id ? result.data : category)),
      );
      setNotice('Configuration saved and recorded in the audit log.');
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'The configuration change could not be saved.',
      );
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      const result = await api.createCategory({
        name,
        description: description.trim() || null,
        slaHours: Number(slaHours),
      });
      setCategories((items) =>
        [...items, result.data].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setName('');
      setDescription('');
      setNotice('Category created and recorded in the audit log.');
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'The category could not be created.',
      );
    }
  }

  async function searchDirectory(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      const result = await api.adminDirectory(directorySearch.trim());
      setStaff(result.data.items);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError ? caught.message : 'The staff directory search failed.',
      );
    }
  }

  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <Link className="wordmark" to={roleRoutes.ADMINISTRATOR}>
          SGRS<span> / Category and staffing register</span>
        </Link>
        <div className="workspace-header__account">
          <div>
            <strong>{user?.name}</strong>
            <span>{user?.email}</span>
          </div>
          <Link className="button button--quiet" to="/app/admin/reports">
            Reports
          </Link>
          <Link className="button button--quiet" to="/app/admin/users">
            Manage staff accounts
          </Link>
          <button className="button button--quiet" onClick={() => void logout()}>
            Sign out
          </button>
        </div>
      </header>
      <ScrollReveal as="section" className="workspace-intro workspace-intro--compact" distance={24}>
        <p className="eyebrow">ADMINISTRATION · ROUTING CONFIGURATION</p>
        <h1>Categories and staffing.</h1>
        <p>
          Changes affect future routing. Submitted cases retain their saved SLA snapshot and
          assignment history.
        </p>
      </ScrollReveal>
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
      <ScrollReveal as="section" className="user-register">
        <h2>Create category</h2>
        <form className="inline-config-form" onSubmit={(event) => void createCategory(event)}>
          <label>
            Name
            <input
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Description
            <input
              maxLength={4000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label>
            SLA hours
            <input
              required
              type="number"
              min="1"
              max="8760"
              value={slaHours}
              onChange={(event) => setSlaHours(event.target.value)}
            />
          </label>
          <button className="button button--primary">Create category</button>
        </form>
      </ScrollReveal>
      <ScrollReveal as="section" className="case-section" aria-labelledby="category-list-heading">
        <div className="case-section__heading">
          <div>
            <p className="eyebrow">CATEGORY REGISTER</p>
            <h2 id="category-list-heading">Routing and escalation</h2>
          </div>
          <span>{categories.length} categories</span>
        </div>
        {loading ? (
          <p role="status">Loading configuration…</p>
        ) : (
          categories.map((category, index) => (
            <ScrollReveal
              as="article"
              className="category-admin-card"
              key={category.id}
              delay={(index % 3) * 0.08}
              distance={24}
            >
              <div className="category-admin-card__heading">
                <div>
                  <p className="eyebrow">POLICY VERSION {category.policyVersion}</p>
                  <h2>{category.name}</h2>
                  <p>{category.description ?? 'No description.'}</p>
                </div>
                <span>{category.isActive ? 'Active for new submissions' : 'Inactive'}</span>
              </div>
              <form
                className="inline-config-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void run(() =>
                    api.updateCategory(category.id, {
                      name: String(form.get('name') ?? '').trim(),
                      description: String(form.get('description') ?? '').trim() || null,
                      slaHours: Number(form.get('slaHours')),
                    }),
                  );
                }}
              >
                <label>
                  Category name
                  <input name="name" required maxLength={100} defaultValue={category.name} />
                </label>
                <label>
                  Description
                  <input
                    name="description"
                    maxLength={4000}
                    defaultValue={category.description ?? ''}
                  />
                </label>
                <label>
                  SLA hours
                  <input
                    name="slaHours"
                    required
                    type="number"
                    min="1"
                    max="8760"
                    defaultValue={category.slaHours}
                  />
                </label>
                <button className="button button--quiet">Save category</button>
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() =>
                    void run(() =>
                      api.updateCategory(category.id, { isActive: !category.isActive }),
                    )
                  }
                >
                  {category.isActive ? 'Deactivate category' : 'Reactivate category'}
                </button>
              </form>
              <MappingEditor
                category={category}
                staff={staff}
                onAdd={(categoryId, input) => run(() => api.addCategoryHandler(categoryId, input))}
                onEnd={(categoryId, mappingId) =>
                  run(() => api.endCategoryHandler(categoryId, mappingId))
                }
                onPrimary={(categoryId, mappingId) =>
                  run(() => api.setPrimaryHandler(categoryId, mappingId))
                }
              />
              <RuleEditor
                category={category}
                staff={staff}
                onSave={(categoryId, input) => run(() => api.saveEscalationRule(categoryId, input))}
              />
            </ScrollReveal>
          ))
        )}
      </ScrollReveal>
      <ScrollReveal
        as="section"
        className="case-detail-panel"
        aria-labelledby="staff-directory-heading"
      >
        <p className="eyebrow">INTERNAL DIRECTORY</p>
        <h2 id="staff-directory-heading">Handlers and reviewers</h2>
        <form className="user-search" onSubmit={(event) => void searchDirectory(event)}>
          <label className="visually-hidden" htmlFor="staff-directory-search">
            Search staff by name or email
          </label>
          <input
            id="staff-directory-search"
            type="search"
            maxLength={120}
            placeholder="Search name or email"
            value={directorySearch}
            onChange={(event) => setDirectorySearch(event.target.value)}
          />
          <button className="button button--quiet">Search staff</button>
          <button
            type="button"
            className="button button--quiet"
            onClick={() => {
              setDirectorySearch('');
              void api
                .adminDirectory()
                .then((result) => setStaff(result.data.items))
                .catch(() => setError('The staff directory could not be refreshed.'));
            }}
          >
            Clear search
          </button>
        </form>
        <div className="table-wrap">
          <table>
            <caption className="visually-hidden">Staff directory with category assignments</caption>
            <thead>
              <tr>
                <th scope="col">Staff member</th>
                <th scope="col">Role</th>
                <th scope="col">Department</th>
                <th scope="col">Categories</th>
                <th scope="col">Access</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((person) => (
                <tr key={person.id}>
                  <th scope="row">
                    {person.name}
                    <br />
                    <small>{person.email}</small>
                  </th>
                  <td>{person.role}</td>
                  <td>{person.departmentName ?? '—'}</td>
                  <td>{person.categories.join(', ') || 'Not mapped'}</td>
                  <td>{person.isActive ? 'Active' : 'Inactive'}</td>
                </tr>
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={5}>No handler or reviewer accounts found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ScrollReveal>
    </main>
  );
}
