import type {
  GrievanceCategoryOption,
  GrievanceDetail,
  GrievanceListResponse,
  GrievanceStatus,
} from '@sgrs/contracts';
import { AppError } from '../../../infrastructure/errors/app-error.js';
import type { GrievanceActor, GrievanceRepository } from './ports.js';
import { RoutingService } from './routing-service.js';
import {
  validateDraftPatch,
  validateSubmission,
  type GrievancePatch,
} from '../domain/validation.js';

export class GrievanceService {
  private readonly routing = new RoutingService();

  constructor(
    private readonly repository: GrievanceRepository,
    private readonly institutionTimeZone: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  categories(): Promise<GrievanceCategoryOption[]> {
    return this.repository.listCategories();
  }

  createDraft(actor: GrievanceActor, requestId: string): Promise<GrievanceDetail> {
    this.requireStudent(actor);
    return this.repository.createDraft(actor, requestId);
  }

  list(
    actor: GrievanceActor,
    input: {
      page: number;
      pageSize: number;
      status?: GrievanceStatus;
      query?: string;
      sort?: 'updated' | 'deadline' | 'status';
    },
  ): Promise<GrievanceListResponse['data']> {
    if (!['STUDENT', 'HANDLER', 'REVIEWER', 'ADMINISTRATOR'].includes(actor.role)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to grievance records.');
    }
    return this.repository.list({
      actor,
      page: input.page,
      pageSize: input.pageSize,
      ...(input.status ? { status: input.status } : {}),
      ...(input.query ? { query: input.query } : {}),
      ...(input.sort ? { sort: input.sort } : {}),
    });
  }

  get(actor: GrievanceActor, grievanceId: string): Promise<GrievanceDetail> {
    if (!['STUDENT', 'HANDLER', 'REVIEWER', 'ADMINISTRATOR'].includes(actor.role)) {
      throw new AppError(404, 'GRIEVANCE_NOT_FOUND', 'Grievance was not found.');
    }
    return this.repository.get(actor, grievanceId);
  }

  async updateDraft(
    actor: GrievanceActor,
    input: {
      grievanceId: string;
      expectedVersion: number;
      patch: GrievancePatch;
      requestId: string;
    },
  ): Promise<GrievanceDetail> {
    this.requireStudent(actor);
    const patch = validateDraftPatch(input.patch);
    if (Object.keys(patch).length === 0) {
      throw new AppError(400, 'EMPTY_UPDATE', 'Change at least one field before saving.');
    }
    const current = await this.repository.get(actor, input.grievanceId);
    if (current.status === 'PENDING_MANUAL_ASSIGNMENT') {
      if (patch.categoryId !== undefined && patch.categoryId !== current.categoryId) {
        throw new AppError(409, 'CATEGORY_LOCKED', 'Category cannot be changed after submission.');
      }
      validateSubmission(
        {
          title: patch.title === undefined ? current.title : patch.title,
          description: patch.description === undefined ? current.description : patch.description,
          categoryId: current.categoryId,
          incidentDate:
            patch.incidentDate === undefined ? current.incidentDate : patch.incidentDate,
          location: patch.location === undefined ? current.location : patch.location,
          priority: patch.priority ?? current.priority,
        },
        true,
        this.now(),
        this.institutionTimeZone,
      );
    } else if (current.status !== 'DRAFT') {
      throw new AppError(409, 'GRIEVANCE_LOCKED', 'This grievance can no longer be edited.');
    }
    return this.repository.update(actor, { ...input, patch });
  }

  async submit(
    actor: GrievanceActor,
    input: {
      grievanceId: string;
      submissionKey: string;
      requestId: string;
    },
  ): Promise<GrievanceDetail> {
    this.requireStudent(actor);
    if (!/^[0-9a-f-]{36}$/i.test(input.submissionKey)) {
      throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'A valid submission key is required.');
    }
    const prior = await this.repository.findSubmittedByKey(actor, input.submissionKey);
    if (prior) {
      if (prior.id !== input.grievanceId) {
        throw new AppError(
          409,
          'IDEMPOTENCY_KEY_REUSED',
          'This submission key was already used for another grievance.',
        );
      }
      return prior;
    }

    const context = await this.repository.getSubmissionContext(actor, input.grievanceId);
    if (context.status !== 'DRAFT') {
      throw new AppError(409, 'INVALID_STATE', 'Only a saved draft can be submitted.');
    }
    const at = this.now();
    validateSubmission(
      context.fields,
      Boolean(context.category?.isActive),
      at,
      this.institutionTimeZone,
    );
    const plan = this.routing.plan(context, at);
    return this.repository.submit(actor, {
      grievanceId: input.grievanceId,
      expectedVersion: context.version,
      submissionKey: input.submissionKey,
      plan,
      requestId: input.requestId,
    });
  }

  withdraw(
    actor: GrievanceActor,
    grievanceId: string,
    requestId: string,
  ): Promise<GrievanceDetail> {
    this.requireStudent(actor);
    return this.repository.withdraw(actor, grievanceId, requestId);
  }

  private requireStudent(actor: GrievanceActor): void {
    if (actor.role !== 'STUDENT') {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only students can manage their own grievance submissions.',
      );
    }
  }
}
