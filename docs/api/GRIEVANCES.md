# Phase 3 API inventory

All routes are under `/api/v1`. Authenticated cookie requests use the Phase 2 session. Mutations require same-origin and CSRF validation. Request and response data use JSON except evidence upload/download.

| Method | Endpoint                                        | Access                                         | Responsibility                                                                                                                         |
| ------ | ----------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/student/grievance-categories`                 | Student                                        | Return active category IDs/names/descriptions available for submission.                                                                |
| POST   | `/student/grievances`                           | Student + CSRF                                 | Create an owned, incomplete DRAFT; return complete draft DTO.                                                                          |
| GET    | `/grievances?page=&pageSize=&status=`           | Student, Handler, Administrator                | Paginated list scoped to owner, active assignment, or all cases respectively.                                                          |
| GET    | `/grievances/:grievanceId`                      | Student, Handler, Administrator                | Read case details, public status history, visible evidence metadata and current assigned handler; hidden resources return 404.         |
| PATCH  | `/student/grievances/:grievanceId`              | Owner Student + CSRF                           | Save fields with required current `version`; 409 on stale/locked record.                                                               |
| POST   | `/student/grievances/:grievanceId/evidence`     | Owner Student + CSRF                           | Multipart evidence upload. Returns accepted metadata and per-file `rejectedFiles`; no raw storage key.                                 |
| POST   | `/student/grievances/:grievanceId/submit`       | Owner Student + CSRF + `Idempotency-Key` UUID  | Validate, allocate unique reference, snapshot SLA, route or enqueue manual assignment, persist notifications/history/audit atomically. |
| POST   | `/student/grievances/:grievanceId/withdraw`     | Owner Student + CSRF                           | Withdraw an eligible grievance; closes an active assignment and records status/audit/notification.                                     |
| GET    | `/grievances/:grievanceId/evidence/:evidenceId` | Student owner, assigned Handler, Administrator | Stream private evidence after case-level authorization; adds `nosniff` and private cache headers.                                      |

`Management` and `Reviewer` have no case-level API access in Phase 3. Reporting and reviewer functions are later scopes. Draft write DTO fields are `title`, `description`, `categoryId`, `incidentDate` (`YYYY-MM-DD`), `location`, and optional `priority`; PATCH also requires `version`. Evidence upload DTO returns `{ items: [{ id, originalName, mediaType, sizeBytes, uploadedAt }], rejectedFiles: [{ fileName, code, message }] }`. Submit/detail DTOs include case number, current status, category, handler display name, incident date, SLA snapshot and public status history.

Every grievance summary also includes `hasDraftContent`, a server-computed boolean indicating whether a draft contains any saved title, description, category, incident date, location, non-default priority or evidence. The student dashboard uses this flag to omit empty drafts; it does not change case ownership, delete draft records or expose draft description text in list responses. Opening a new grievance form does not create a record; a draft is created when the student first saves, uploads evidence or submits.

No public registration endpoint is provided. Role is obtained from the authenticated server session, never from a caller-supplied role field.

## Phase 4 workflow API

All mutations below require the authenticated cookie session, same-origin check and CSRF token. A missing/inaccessible case is returned as 404 to avoid exposing whether another role owns it; invalid lifecycle transitions return 409.

| Method | Endpoint                                                                     | Access                                    | Responsibility                                                                                                   |
| ------ | ---------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| GET    | `/handler/workload`                                                          | Handler                                   | Counts active assignments, overdue cases and cases by current status.                                            |
| GET    | `/grievances?q=&status=&sort=&page=&pageSize=`                               | Student, Handler, Administrator, Reviewer | Search/sort within the caller's authorized scope; handlers remain limited to active assignments.                 |
| POST   | `/handler/grievances/:grievanceId/start-review`                              | Currently assigned Handler                | Transition ASSIGNED → UNDER_REVIEW and append status/audit/notification records.                                 |
| POST   | `/handler/grievances/:grievanceId/internal-notes`                            | Currently assigned Handler                | Append a staff-only investigation remark. Never returned to Student.                                             |
| POST   | `/handler/grievances/:grievanceId/information-requests`                      | Currently assigned Handler                | Append student-visible request; transition UNDER_REVIEW → AWAITING_INFORMATION; notify Student.                  |
| POST   | `/student/grievances/:grievanceId/information-requests/:requestId/responses` | Owning Student                            | Append response linked to valid request; transition AWAITING_INFORMATION → UNDER_REVIEW; notify current Handler. |
| POST   | `/handler/grievances/:grievanceId/escalations`                               | Currently assigned Handler                | Require reason; manual escalation from UNDER_REVIEW only; create next level and notify relevant parties.         |
| GET    | `/reviewer/escalations?q=&page=&pageSize=`                                   | Reviewer                                  | Return escalation levels assigned to this reviewer, with grievance summary and level context.                    |
| POST   | `/reviewer/grievances/:grievanceId/escalations/:level/start`                 | Reviewer assigned to level                | Change REVIEWER_ASSIGNED → UNDER_REVIEWER_HANDLING.                                                              |
| POST   | `/reviewer/grievances/:grievanceId/directions`                               | Reviewer actively handling assigned level | Append a staff-only reviewer direction and audit event.                                                          |
| POST   | `/reviewer/grievances/:grievanceId/escalations`                              | Reviewer actively handling assigned level | Require reason and create the next escalation level; prior level becomes ESCALATED_FURTHER.                      |
| GET    | `/admin/reviewers`                                                           | Administrator                             | List active reviewer accounts for manual assignment.                                                             |
| GET    | `/admin/escalations/manual-assignment`                                       | Administrator                             | List escalation levels waiting for manual reviewer assignment.                                                   |
| PATCH  | `/admin/escalations/:escalationId/reviewer`                                  | Administrator                             | Assign an active reviewer; enqueue notification and audit record transactionally.                                |

Case-detail DTO includes chronological `messages` and `escalationLevels`. Student responses omit `STAFF_ONLY` messages and escalation assignment metadata. Reviewer details require a reviewer assignment on the case; reviewer actions further require their currently active handling level. Resolution cycles and student feedback are included from Phase 5; reopening and decision override remain outside this API until their policies are approved.

## Phase 5 resolution and feedback API

Mutations require an authenticated cookie session, same-origin validation and CSRF token. Case visibility and current assignment are rechecked in the repository transaction; role middleware alone is not sufficient authorization.

| Method | Endpoint                                    | Access                                                                                    | Responsibility                                                                                                                                     |
| ------ | ------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/handler/grievances/:grievanceId/resolve`  | Currently assigned Handler; case must be `UNDER_REVIEW`                                   | Requires nonblank `remarks`; records the next resolution cycle, status history, audit and student notification/outbox atomically.                  |
| POST   | `/reviewer/grievances/:grievanceId/resolve` | Reviewer actively handling an assigned escalation level; case must be `ESCALATED`         | Same resolution operation and records as handler resolution, scoped to the active reviewer level.                                                  |
| POST   | `/student/grievances/:grievanceId/feedback` | Original owning Student; current case must be `RESOLVED` with an unexpired feedback cycle | Accepts integer `rating` 1–5 and optional `comment`; closes the case and appends feedback, history, audit and notification/outbox transactionally. |

Resolution cycle data is included in authorized grievance detail as `resolutionCycles`, in ascending cycle order, with resolver, remarks, resolution timestamp, feedback deadline, closure timestamp and optional feedback. The feedback boundary is inclusive (`submittedAt <= feedbackDeadline`). No reopen route exists; `reopenDeadline` remains unset under DEC-010.

## Phase 6 administration, notifications, reports and audit API

All mutation routes use the authenticated session, same-origin validation and CSRF protection. Identifiers and role scopes are verified by backend services/repositories. Management is restricted to aggregate report responses and has no case-level API access.

| Method | Endpoint                                                    | Access                                           | Responsibility                                                                               |
| ------ | ----------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| GET    | `/admin/categories`                                         | Administrator                                    | List categories and current routing configuration.                                           |
| POST   | `/admin/categories`                                         | Administrator + CSRF                             | Create a category and its initial configuration.                                             |
| PATCH  | `/admin/categories/:categoryId`                             | Administrator + CSRF                             | Update category configuration and SLA/policy values.                                         |
| POST   | `/admin/categories/:categoryId/handlers`                    | Administrator + CSRF                             | Create a temporal handler mapping, with optional primary designation.                        |
| DELETE | `/admin/categories/:categoryId/handlers/:mappingId`         | Administrator + CSRF                             | End the active mapping while preserving its history.                                         |
| PATCH  | `/admin/categories/:categoryId/handlers/:mappingId/primary` | Administrator + CSRF                             | Make an active handler mapping primary for its category.                                     |
| PUT    | `/admin/categories/:categoryId/escalation-rules`            | Administrator + CSRF                             | Upsert category escalation-level reviewer configuration.                                     |
| GET    | `/admin/directory?q=&page=&pageSize=`                       | Administrator                                    | Search staff identity, role, category and routing assignment details.                        |
| GET    | `/notifications?page=&pageSize=`                            | Student, Handler, Reviewer, Administrator        | Read only the caller's recipient-scoped in-app inbox and unread count. Management is denied. |
| PATCH  | `/notifications/:notificationId/read`                       | Student, Handler, Reviewer, Administrator + CSRF | Mark a caller-owned notification read; repeated mark-read is idempotent.                     |
| GET    | `/admin/reports/overview`                                   | Administrator                                    | Return aggregate case volume, status and overdue counts.                                     |
| GET    | `/management/reports/overview`                              | Management                                       | Return the same aggregate overview; no case-level data.                                      |
| GET    | `/admin/reports/categories?from=&to=`                       | Administrator                                    | Return aggregate categories/status/time report.                                              |
| GET    | `/management/reports/categories?from=&to=`                  | Management                                       | Return aggregate categories/status/time report only.                                         |
| GET    | `/admin/reports/handlers?from=&to=`                         | Administrator                                    | Return handler current load and first-resolution elapsed-time metrics.                       |
| GET    | `/admin/grievances/:grievanceId/audit?page=&pageSize=`      | Administrator                                    | Read paginated audit events for a case.                                                      |

Period semantics and handler resolution-time formula are provisional per DEC-027. In-app inbox and transactional outbox persistence are implemented; email delivery and deadline reminder cadence are deferred per DEC-031.
