# Phase 5 — Resolution, feedback and closure

## Domain behavior

- A handler may resolve a grievance only while it is `UNDER_REVIEW` and they hold its active assignment.
- A reviewer may resolve only while the grievance is `ESCALATED` and the reviewer is actively handling one of its assigned escalation levels.
- Resolution remarks are trimmed and required. A resolution creates a numbered `ResolutionCycle`, moves the grievance to `RESOLVED`, and sets the feedback deadline to exactly 72 hours after resolution.
- Only the original student may give feedback for the current resolution cycle. Ratings are integers 1–5, comments are optional, and the inclusive acceptance boundary is `submittedAt <= feedbackDeadline`.
- Feedback closes the grievance immediately. If the deadline passes without feedback, the worker closes it automatically.
- Reopening is intentionally unavailable. DEC-010 records the explicit owner decision to omit reopening UI/API and defer the eligibility window, allowed statuses and reassignment behavior. `reopenDeadline` remains unset.

## Backend boundaries

HTTP routes validate and authenticate requests, then delegate to `ResolutionService`. The service owns duration/rating/remarks policy and calls the same `GrievanceRepository` port for API and worker operations. The Prisma repository owns persistence, active-assignment authorization and atomic lifecycle changes. The worker owns cadence, `JobRun` execution recording and graceful shutdown; it contains no grievance state-transition rules.

## Atomicity and concurrency

Resolution and feedback transactions lock the grievance row before checking current status and active assignment/ownership. Each transaction includes the state change, resolution-cycle or feedback write, `StatusHistory`, `AuditLog`, `Notification` and `NotificationOutbox` rows. Any failure rolls all of those writes back.

Timeout closure selects only current, unresolved cycles with an expired feedback deadline and no feedback. It locks selected grievance rows with `FOR UPDATE SKIP LOCKED` and limits each batch. The row lock serializes API feedback against worker closure; after the winner commits, another worker either skips the locked row or no longer selects it. A partial unique index permits at most one `is_current` resolution cycle per grievance, a unique `(grievance_id, cycle_number)` preserves cycle numbering, and `feedback.resolution_cycle_id` is unique to prevent duplicate feedback.

The API and worker call `ResolutionService.closeExpiredFeedback`; the worker does not duplicate timeout logic. Each run has a `JobRun` row with start/finish time, counts, redacted failure summary and a unique idempotency key. A hard process termination can leave a run in `RUNNING`; stale-run reconciliation is not part of this milestone.

## Data invariants

- PostgreSQL checks `feedback.rating BETWEEN 1 AND 5`.
- The unique feedback foreign key enforces at most one feedback row per cycle.
- A partial unique index enforces at most one current cycle per grievance.
- Workflow history and audit rows are append-only under existing database triggers.
- Closure timestamp is stored on both the current `ResolutionCycle` and `Grievance`.
- Timeout closure has no human actor; `AuditLog.source = WORKER` identifies its origin and the job run ID is carried as `requestId`.

## API routes

See [`GRIEVANCES.md`](../api/GRIEVANCES.md#phase-5-resolution-and-feedback-api). No reopen API exists.

## Verification

The Phase 5 integration coverage exercises handler/reviewer authorization, validation, feedback, immediate closure, duplicate prevention, transactional audit/outbox writes, timeout closure and simultaneous workers. Worker unit tests verify shared-service delegation and persisted success/failure reporting. See [`TRACEABILITY.md`](../requirements/TRACEABILITY.md#phase-5--resolution-feedback-and-automatic-closure) for the current verification environment status.
