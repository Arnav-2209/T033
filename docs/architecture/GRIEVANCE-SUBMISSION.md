# Phase 3: grievance submission, evidence and automatic routing

## Scope and boundaries

Phase 3 implements student drafts and submissions, category choices, evidence uploads, case detail/history, scoped student and handler lists, withdrawal, case-reference allocation, category-based primary routing, manual-assignment notification, and SLA snapshots. It does not implement handler status changes, reviewer escalation, resolution, closure, feedback, scheduled reminders, or real email delivery.

The web application uses shared serializable DTOs from `packages/contracts`. Fastify routes perform HTTP parsing, authentication/CSRF checks and response shaping. Application services enforce role and workflow rules. Domain validation and routing decisions are independent of Prisma. The Prisma repository owns persistence and transaction boundaries. Local evidence storage implements a private storage port; evidence bytes never live in PostgreSQL or the public web root.

## Student workflow

1. The server provides active categories. A student creates a draft, which immediately has a private owner and a DRAFT status history/audit record.
2. Draft fields are saved with optimistic `version` checks. The student may attach evidence before submission. A saved draft may be incomplete.
3. Submit validates title (1–150), nonblank description, active category and a valid incident date not after the institution-local current date. Location remains optional (DEC-018). The current priority defaults to NORMAL; it does not change routing/SLA (DEC-005).
4. A per-request UUID idempotency key prevents duplicate submissions. A category policy snapshot and routing choice are rechecked while the grievance row is locked.
5. A sequence-backed case reference, timestamp, category SLA hours/version, status history, optional assignment, notifications/outbox rows and immutable audit event commit atomically. Automatic routing creates one AUTO assignment and stores ASSIGNED. No eligible primary handler stores PENDING_MANUAL_ASSIGNMENT and queues administrator in-app notifications.
6. The student can view only owned grievances. A handler can list/read only grievances with their active assignment. Administrator operations see all; reviewer and management cannot read individual case endpoints.

## Service and transaction design

`GrievanceService` coordinates draft creation, validation, optimistic updates, submission, reads and withdrawal. `RoutingService` consumes a submission context and timestamp and returns either the one eligible primary handler or `null`, plus an SLA hours/policy version/deadline snapshot. `EvidenceService` validates files, hashes content and coordinates storage with evidence metadata. Scheduled jobs must call these same application services when later phases add timers; they must not duplicate domain decisions.

Submission locks the draft with `SELECT … FOR UPDATE`, then re-reads owner, state, version, active category, policy version and primary mapping. It rejects stale versions/configuration instead of submitting against a policy different from the one reviewed. A database unique constraint protects the idempotency key and another protects the case number. The whole DB mutation uses one Prisma transaction; notifications and outbox are written in that transaction. Concurrent submissions against a single draft serialize on the grievance row. Sequence gaps after rollbacks are expected and do not imply missing records.

Draft edits use row locks plus expected-version checking. Evidence metadata and audit events commit together after private bytes are stored; if the DB step fails, the service removes the newly written blobs. A process crash in the short interval between blob write and metadata commit can leave an unreferenced private blob; a later orphan cleanup job is recommended, but no automatic deletion/retention policy is introduced here.

## Evidence handling

- Accept `.pdf`, `.jpg`, `.jpeg`, `.png` only when the declared MIME and leading signature agree.
- Enforce 5 MiB per file (5×1024×1024 bytes) and at most 10 parts per request. The batch limit is provisional; no aggregate storage quota is currently defined.
- Invalid files receive individual codes/messages. Valid files in the same request can still be saved, following PDF CS-01's per-file rejection behavior.
- Storage keys are random UUIDs. The local adapter writes outside the public web root with restrictive directory/file modes. API download checks grievance visibility before opening a stream and writes an audit event.
- The DB stores original filename, verified media type, byte count, SHA-256 digest, uploader, storage key and scan state. Signature checks are not deep document parsing or malware scanning; scan state remains pending.
- The evidence route only accepts an authenticated student's own draft with no assignment. The storage adapter can be replaced by private object storage without changing application rules.

## API and errors

The endpoint inventory, verbs and route roles are maintained in `docs/api/GRIEVANCES.md`. Responses use `{ data: ... }`; errors use `{ error: { code, message, requestId, details? } }`. Validation errors include field paths under `details.fields`; stale versions/state/configuration use HTTP 409. Resource visibility failures are returned as not found to avoid disclosing another student's case. Authentication/role guard failures remain 401/403.

## Outstanding policy choices

See `docs/requirements/DECISIONS.md`: category SLA durations and actual staff mapping, elapsed vs working-time SLA, priority semantics, text/batch ceilings, evidence scanning/retention, location optionality, and post-submission edits are not all ratified by source documentation. Implemented defaults are explicit and can be changed without silently treating them as policy.
