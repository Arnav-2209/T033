# Phase 6 — administration, notifications, reports and audit

## Scope

Phase 6 adds administrator-facing category and staff-routing configuration, a recipient-scoped in-app notification inbox, role-limited aggregate reporting, and paginated administrator audit views. The implementation extends the modular monolith: HTTP routes call application services, which enforce roles and validate input before repositories perform authorization-scoped reads and transactional writes. Prisma/PostgreSQL remains the persistence boundary.

## Category configuration and directory

`CategoryHandler` mappings are effective-dated records. A new mapping starts at an explicit active time; ending it records `activeTo` rather than deleting history. A partial unique index prevents duplicate active pairs. Routing reads active mappings and their primary designation. The older `Category.primaryHandlerId` column is not read by routing. This is a provisional choice tracked in DEC-030.

The existing administrator users page remains responsible for account creation, role changes and deactivation. Category management provides directory search and category/mapping context; it does not create a second account lifecycle. Search remains administrator-only pending clarification of FR-020 (DEC-029).

## Notifications and outbox

Workflow transactions persist recipient-scoped `Notification` rows and matching in-app `NotificationOutbox` rows together with the business action. Inbox routes always scope by the authenticated recipient. Management has no inbox permission because the role receives aggregate reporting only. The UI paginates notifications and audit entries. No email sender, deadline reminder scheduler, reminder cadence or retry policy is enabled; FR-038 needs a decision on lead time, recurrence, channel and retries (DEC-031).

## Reports and privacy

Overview and category reports expose aggregates to administrators and Institute Management. Handler metrics are administrator-only and are not exposed at case level to Management. Period filters are currently a half-open range over grievance submission time. Resolution duration is elapsed time from submission to the first resolution cycle; current active workload is a live snapshot and does not vary with the selected period. These definitions are implementation recommendations awaiting owner confirmation (DEC-027).

## Audit

Configuration and workflow mutations append audit events within the same transaction as the change. Administrators can page through grievance audit records. Database triggers protect append-only audit and lifecycle history. API response DTOs omit sensitive private investigation remarks; aggregate Management reports do not include case audit records.

## Verification

Phase 6 PostgreSQL integration coverage exercises category/mapping administration, directory search and account maintenance, notification recipient scope and CSRF behavior, report-role boundaries and period validation, audit pagination and append-only protection. Frontend tests cover directory search, inbox mark-read behavior, audit pagination and Management's aggregate-only navigation. The full workspace verification results and applied migration state are recorded in `docs/requirements/TRACEABILITY.md` after completion.
