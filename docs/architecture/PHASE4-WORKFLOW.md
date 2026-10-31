# Phase 4 workflow architecture

Phase 4 extends the existing modular monolith. HTTP route modules authenticate and validate transport input; `CaseWorkflowService` applies role/domain policy; `PrismaGrievanceRepository` scopes reads and performs lifecycle writes. Notifications, outbox events, status history and audit events are written in the same Prisma transaction as each workflow action.

## Lifecycle paths implemented

```text
ASSIGNED --handler starts--> UNDER_REVIEW
UNDER_REVIEW --handler requests info--> AWAITING_INFORMATION
AWAITING_INFORMATION --owner responds--> UNDER_REVIEW
UNDER_REVIEW --handler manual escalation--> ESCALATED + level 1
ESCALATED + REVIEWER_ASSIGNED --reviewer starts--> ESCALATED + UNDER_REVIEWER_HANDLING
UNDER_REVIEWER_HANDLING --reviewer further escalates--> ESCALATED + next level
AWAITING_MANUAL --administrator assignment--> REVIEWER_ASSIGNED
```

Manual escalation is currently limited to `UNDER_REVIEW` (DEC-008). Without a configured active reviewer, the grievance remains `ESCALATED`, while its new level is `AWAITING_MANUAL` and active administrators receive notifications (DEC-009). Both are recommendations under open decisions, not ratified institutional policy.

## Consistency and authorization

State-changing operations lock the grievance row with `SELECT ... FOR UPDATE`, validate current state and assignment inside the transaction, then persist messages/status history/escalations/notifications/outbox/audit. The escalation table's unique `(grievance_id, level)` constraint is the final duplicate-level guard. Manual reviewer assignment locks the same grievance before re-reading the escalation state. Student reads filter staff-only messages in DTO mapping; handler, reviewer and admin scopes are checked in repository queries as well as role middleware. Evidence download uses the same grievance authorization predicate.

`case_messages`, `status_history` and `audit_log` are append-only at the database layer. Corrections are represented as a subsequent message/event. Notification delivery workers can later consume the transactional outbox without moving workflow rules into the worker; scheduled jobs must call the same application services as API operations.

## Deliberate scope boundary

Resolution creation/override, feedback, reopening, closure, automatic SLA escalation and report generation remain later or unresolved work. Phase 4 reviewer actions are directions and successive escalation only. Open policy points are tracked in `docs/requirements/DECISIONS.md`.
