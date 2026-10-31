import type { SubmissionContext, SubmissionPlan } from './ports.js';

export class RoutingService {
  plan(context: SubmissionContext, at: Date): SubmissionPlan {
    const category = context.category;
    if (!category || !category.isActive) {
      throw new Error('Routing plan requires an active category.');
    }
    const primary = category.primaryHandlers.find(
      (handler) =>
        handler.role === 'HANDLER' &&
        handler.isActive &&
        handler.activeFrom <= at &&
        (handler.activeTo === null || handler.activeTo > at),
    );
    return {
      handlerId: primary?.handlerId ?? null,
      slaHours: category.slaHours,
      policyVersion: category.policyVersion,
      resolutionDeadline: new Date(at.getTime() + category.slaHours * 60 * 60 * 1_000),
      at,
    };
  }
}
