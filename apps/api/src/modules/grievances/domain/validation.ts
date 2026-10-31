import { grievancePriorities, type GrievancePriority } from '@sgrs/contracts';
import { AppError } from '../../../infrastructure/errors/app-error.js';

export interface GrievanceFields {
  title: string | null;
  description: string | null;
  categoryId: string | null;
  incidentDate: string | null;
  location: string | null;
  priority: GrievancePriority;
}

export type GrievancePatch = Partial<GrievanceFields>;

export interface FieldError {
  field: string;
  message: string;
}

export function validationFailure(fields: FieldError[]): never {
  throw new AppError(400, 'VALIDATION_FAILED', 'Correct the highlighted fields and try again.', {
    fields,
  });
}

export function currentDateInZone(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function normalizePatch(patch: GrievancePatch): GrievancePatch {
  return {
    ...patch,
    ...(patch.title === undefined ? {} : { title: patch.title?.trim() || null }),
    ...(patch.description === undefined ? {} : { description: patch.description?.trim() || null }),
    ...(patch.location === undefined ? {} : { location: patch.location?.trim() || null }),
  };
}

export function validateDraftPatch(patch: GrievancePatch): GrievancePatch {
  const normalized = normalizePatch(patch);
  const errors: FieldError[] = [];
  if (normalized.title && normalized.title.length > 150) {
    errors.push({ field: 'title', message: 'Title must be 150 characters or fewer.' });
  }
  if (normalized.description && normalized.description.length > 20_000) {
    errors.push({
      field: 'description',
      message: 'Description must be 20,000 characters or fewer.',
    });
  }
  if (normalized.location && normalized.location.length > 240) {
    errors.push({ field: 'location', message: 'Location must be 240 characters or fewer.' });
  }
  if (
    normalized.categoryId !== undefined &&
    normalized.categoryId !== null &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      normalized.categoryId,
    )
  ) {
    errors.push({ field: 'categoryId', message: 'Choose a valid category.' });
  }
  if (
    normalized.incidentDate !== undefined &&
    normalized.incidentDate !== null &&
    !isValidCalendarDate(normalized.incidentDate)
  ) {
    errors.push({ field: 'incidentDate', message: 'Enter a valid incident date.' });
  }
  if (normalized.priority !== undefined && !grievancePriorities.includes(normalized.priority)) {
    errors.push({ field: 'priority', message: 'Choose a valid priority.' });
  }
  if (errors.length) validationFailure(errors);
  return normalized;
}

export function validateSubmission(
  fields: GrievanceFields,
  categoryIsActive: boolean,
  at: Date,
  timeZone: string,
): void {
  const errors: FieldError[] = [];
  const title = fields.title?.trim() ?? '';
  const description = fields.description?.trim() ?? '';
  if (title.length < 1 || title.length > 150) {
    errors.push({ field: 'title', message: 'Enter a title between 1 and 150 characters.' });
  }
  if (!description) errors.push({ field: 'description', message: 'Describe what happened.' });
  if (!fields.categoryId || !categoryIsActive) {
    errors.push({ field: 'categoryId', message: 'Select an active grievance category.' });
  }
  if (!fields.incidentDate || !isValidCalendarDate(fields.incidentDate)) {
    errors.push({ field: 'incidentDate', message: 'Enter a valid incident date.' });
  } else if (fields.incidentDate > currentDateInZone(at, timeZone)) {
    errors.push({ field: 'incidentDate', message: 'Incident date cannot be in the future.' });
  }
  if (fields.location && fields.location.length > 240) {
    errors.push({ field: 'location', message: 'Location must be 240 characters or fewer.' });
  }
  if (errors.length) validationFailure(errors);
}
