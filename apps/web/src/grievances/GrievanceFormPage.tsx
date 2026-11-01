import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type {
  GrievanceCategoryOption,
  GrievanceDetail,
  GrievancePriority,
  GrievancePatch,
} from '@sgrs/contracts';
import { ApiClientError, api } from '../lib/api.js';
import { WorkspaceLayout } from './WorkspaceLayout.js';
import { ScrollReveal } from '../visual/ScrollReveal.js';

interface FormValues {
  title: string;
  description: string;
  categoryId: string;
  incidentDate: string;
  location: string;
  priority: GrievancePriority;
}

const emptyForm: FormValues = {
  title: '',
  description: '',
  categoryId: '',
  incidentDate: '',
  location: '',
  priority: 'NORMAL',
};

function initialForm(detail: GrievanceDetail): FormValues {
  return {
    title: detail.title ?? '',
    description: detail.description ?? '',
    categoryId: detail.categoryId ?? '',
    incidentDate: detail.incidentDate ?? '',
    location: detail.location ?? '',
    priority: detail.priority,
  };
}

function localToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (key: string) => parts.find((item) => item.type === key)?.value ?? '';
  return part('year') + '-' + part('month') + '-' + part('day');
}

function apiFieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiClientError) || typeof error.details !== 'object' || !error.details)
    return {};
  const fields = (error.details as { fields?: Array<{ field?: string; message?: string }> }).fields;
  if (!Array.isArray(fields)) return {};
  return Object.fromEntries(
    fields.flatMap((item) => (item.field && item.message ? [[item.field, item.message]] : [])),
  );
}

function asPatch(values: FormValues): GrievancePatch {
  return {
    title: values.title,
    description: values.description,
    categoryId: values.categoryId || null,
    incidentDate: values.incidentDate || null,
    location: values.location || null,
    priority: values.priority,
  };
}

export function GrievanceFormPage(): ReactNode {
  const { grievanceId } = useParams();
  const navigate = useNavigate();
  const [grievance, setGrievance] = useState<GrievanceDetail | null>(null);
  const [categories, setCategories] = useState<GrievanceCategoryOption[]>([]);
  const [values, setValues] = useState<FormValues>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [rejectedFiles, setRejectedFiles] = useState<Array<{ fileName: string; message: string }>>(
    [],
  );

  useEffect(() => {
    let active = true;
    const detailRequest = grievanceId ? api.getGrievance(grievanceId) : Promise.resolve(null);
    Promise.all([detailRequest, api.listCategories()])
      .then(([detailResponse, categoryResponse]) => {
        if (!active) return;
        if (detailResponse) {
          const detail = detailResponse.data;
          if (!['DRAFT', 'PENDING_MANUAL_ASSIGNMENT'].includes(detail.status)) {
            navigate('/app/student/grievances/' + detail.id, { replace: true });
            return;
          }
          setGrievance(detail);
          setValues(initialForm(detail));
        } else {
          setGrievance(null);
          setValues(emptyForm);
        }
        setCategories(categoryResponse.data.items);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(
            caught instanceof ApiClientError
              ? caught.message
              : 'The grievance form could not be opened.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [grievanceId, navigate]);

  const pendingManual = grievance?.status === 'PENDING_MANUAL_ASSIGNMENT';
  const editable =
    !grievanceId || Boolean(grievance && (grievance.status === 'DRAFT' || pendingManual));

  const ensureDraft = useCallback(async (): Promise<GrievanceDetail> => {
    if (grievance) return grievance;
    const response = await api.createGrievanceDraft();
    setGrievance(response.data);
    return response.data;
  }, [grievance]);

  const patchDraft = useCallback(async (): Promise<GrievanceDetail | null> => {
    const current = await ensureDraft();
    const response = await api.updateGrievanceDraft(current.id, current.version, asPatch(values));
    setGrievance(response.data);
    setValues(initialForm(response.data));
    setFieldErrors({});
    return response.data;
  }, [ensureDraft, values]);

  async function saveDraft(): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await patchDraft();
      setMessage(
        pendingManual
          ? 'Your update has been saved.'
          : 'Draft saved. You can return to it any time.',
      );
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Draft could not be saved.');
      setFieldErrors(apiFieldErrors(caught));
    } finally {
      setBusy(false);
    }
  }

  async function uploadEvidence(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem('evidenceFiles');
    if (!(input instanceof HTMLInputElement) || !input.files?.length) return;
    const files = Array.from(input.files);
    setBusy(true);
    setError(null);
    setMessage(null);
    setRejectedFiles([]);
    try {
      const current = await ensureDraft();
      const response = await api.uploadEvidence(current.id, files);
      setRejectedFiles(response.data.rejectedFiles);
      if (response.data.items.length) {
        const refreshed = await api.getGrievance(current.id);
        setGrievance(refreshed.data);
        setMessage(
          response.data.items.length +
            ' evidence file' +
            (response.data.items.length === 1 ? '' : 's') +
            ' added.',
        );
      }
      input.value = '';
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Evidence upload could not be completed.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setFieldErrors({});
    try {
      const saved = await patchDraft();
      if (!saved) return;
      const storageKey = 'sgrs-submit-' + saved.id;
      const idempotencyKey = sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
      sessionStorage.setItem(storageKey, idempotencyKey);
      await api.submitGrievanceDraft(saved.id, idempotencyKey);
      sessionStorage.removeItem(storageKey);
      navigate('/app/student/grievances/' + saved.id + '/submitted');
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : 'Submission could not be completed. Your saved draft is still available.',
      );
      setFieldErrors(apiFieldErrors(caught));
    } finally {
      setBusy(false);
    }
  }

  const title = pendingManual ? 'Update your case details.' : 'Tell us what happened.';
  const formIntro = pendingManual
    ? 'This case is waiting for an administrator to assign a handler. You may update its details while it remains unassigned.'
    : 'Share the details you have. Save a draft now and finish it when you are ready.';
  const dateMaximum = useMemo(localToday, []);

  return (
    <WorkspaceLayout
      role="STUDENT"
      eyebrow={
        pendingManual ? 'UNASSIGNED CASE · EDITS AVAILABLE' : 'NEW GRIEVANCE · PRIVATE SUBMISSION'
      }
      title={title}
      introduction={formIntro}
      actions={
        <Link className="button button--quiet" to="/app/student">
          Back to my cases
        </Link>
      }
    >
      {loading ? (
        <p className="case-loading" role="status">
          Preparing your grievance form…
        </p>
      ) : error && !grievance ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : editable ? (
        <ScrollReveal as="div" className="grievance-editor">
          <div className="grievance-editor__form-column">
            <form className="grievance-form" onSubmit={submit} noValidate>
              <div className="form-section-heading">
                <span>01</span>
                <div>
                  <h2>What happened</h2>
                  <p>
                    Required fields are marked. Details are visible only to authorized case users.
                  </p>
                </div>
              </div>
              {error && (
                <div className="form-error-summary" role="alert">
                  <strong>We could not save this change.</strong>
                  <p>{error}</p>
                  {Object.entries(fieldErrors).map(([field, detail]) => (
                    <p key={field}>
                      <a
                        href={
                          '#' +
                          ({ categoryId: 'field-category', incidentDate: 'field-date' }[field] ??
                            'field-' + field)
                        }
                      >
                        {detail}
                      </a>
                    </p>
                  ))}
                </div>
              )}
              {message && (
                <p className="notice notice--success" role="status">
                  {message}
                </p>
              )}

              <label htmlFor="field-title">
                Title <span aria-hidden="true">*</span>
              </label>
              <input
                id="field-title"
                value={values.title}
                maxLength={150}
                required
                aria-invalid={Boolean(fieldErrors.title)}
                aria-describedby={fieldErrors.title ? 'error-title' : 'hint-title'}
                onChange={(event) => setValues({ ...values, title: event.target.value })}
              />
              <p className="field-hint" id={fieldErrors.title ? 'error-title' : 'hint-title'}>
                {fieldErrors.title ?? values.title.length + '/150 characters'}
              </p>

              <label htmlFor="field-description">
                Description <span aria-hidden="true">*</span>
              </label>
              <textarea
                id="field-description"
                value={values.description}
                maxLength={20_000}
                rows={7}
                required
                aria-invalid={Boolean(fieldErrors.description)}
                aria-describedby={
                  fieldErrors.description ? 'error-description' : 'hint-description'
                }
                onChange={(event) => setValues({ ...values, description: event.target.value })}
              />
              <p
                className="field-hint"
                id={fieldErrors.description ? 'error-description' : 'hint-description'}
              >
                {fieldErrors.description ??
                  'Describe the issue, its impact and any steps already taken.'}
              </p>

              <div className="form-row">
                <div>
                  <label htmlFor="field-category">
                    Category <span aria-hidden="true">*</span>
                  </label>
                  <select
                    id="field-category"
                    value={values.categoryId}
                    required
                    disabled={pendingManual}
                    aria-invalid={Boolean(fieldErrors.categoryId)}
                    onChange={(event) => setValues({ ...values, categoryId: event.target.value })}
                  >
                    <option value="">Choose a category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.categoryId && (
                    <p className="field-error" id="error-categoryId">
                      {fieldErrors.categoryId}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="field-date">
                    Incident date <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="field-date"
                    type="date"
                    value={values.incidentDate}
                    max={dateMaximum}
                    required
                    aria-invalid={Boolean(fieldErrors.incidentDate)}
                    onChange={(event) => setValues({ ...values, incidentDate: event.target.value })}
                  />
                  {fieldErrors.incidentDate && (
                    <p className="field-error">{fieldErrors.incidentDate}</p>
                  )}
                </div>
              </div>

              <div className="form-row">
                <div>
                  <label htmlFor="field-location">Location or department</label>
                  <input
                    id="field-location"
                    value={values.location}
                    maxLength={240}
                    placeholder="Where did this happen?"
                    onChange={(event) => setValues({ ...values, location: event.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor="field-priority">Priority (optional)</label>
                  <select
                    id="field-priority"
                    value={values.priority}
                    onChange={(event) =>
                      setValues({ ...values, priority: event.target.value as GrievancePriority })
                    }
                  >
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
              </div>

              {(!grievance || grievance.status === 'DRAFT') && (
                <div className="grievance-form__actions">
                  <button
                    type="button"
                    className="button button--quiet"
                    disabled={busy}
                    onClick={() => void saveDraft()}
                  >
                    {busy ? 'Saving…' : pendingManual ? 'Save case update' : 'Save draft'}
                  </button>
                  <button type="submit" className="button button--primary" disabled={busy}>
                    {busy ? 'Submitting…' : 'Submit grievance'} <span aria-hidden="true">↗</span>
                  </button>
                </div>
              )}
              {pendingManual && (
                <div className="grievance-form__actions">
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={busy}
                    onClick={() => void saveDraft()}
                  >
                    {busy ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              )}
            </form>
          </div>

          <aside className="grievance-editor__aside" aria-labelledby="evidence-heading">
            <p className="eyebrow">SUPPORTING RECORDS</p>
            <h2 id="evidence-heading">Evidence</h2>
            <p>
              Attach relevant documents or images. Each file is checked for its actual format and
              size before it is stored privately.
            </p>
            <form onSubmit={uploadEvidence} className="evidence-upload-form">
              <label htmlFor="evidenceFiles">Choose evidence files</label>
              <input
                id="evidenceFiles"
                name="evidenceFiles"
                type="file"
                multiple
                accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
              />
              <p className="field-hint">
                PDF, JPG or PNG · up to 5 MiB each · at most 10 per upload
              </p>
              <button type="submit" className="button button--outline" disabled={busy}>
                {busy ? 'Working…' : 'Upload selected files'}
              </button>
            </form>
            {rejectedFiles.length > 0 && (
              <div className="file-rejections" role="alert">
                <strong>Some files were not added.</strong>
                {rejectedFiles.map((file, index) => (
                  <p key={file.fileName + index}>
                    {file.fileName}: {file.message}
                  </p>
                ))}
              </div>
            )}
            {grievance && grievance.evidence.length > 0 && (
              <ul className="evidence-list" aria-label="Uploaded evidence">
                {grievance.evidence.map((file) => (
                  <li key={file.id}>
                    <a href={api.evidenceUrl(grievance.id, file.id)}>{file.originalName}</a>
                    <span>{(file.sizeBytes / (1024 * 1024)).toFixed(2)} MiB</span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </ScrollReveal>
      ) : null}
    </WorkspaceLayout>
  );
}
