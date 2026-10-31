# Requirements traceability — Phase 1 foundation, Phase 2 auth and Phase 3 grievances

Phase 1 implements foundation infrastructure, not end-user grievance requirements. This matrix maps foundation evidence to the originating requirements and identifies later workflow work. “Foundation pass” means only the narrow runtime/config/schema gate is verified.

| Requirement(s)                        | Foundation module/artifact                                                                       | Verification now                                              | Later acceptance                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------ |
| NFR-013 modularity                    | `apps/web`, `apps/api`, `apps/worker`, `packages/contracts`; root workspace                      | Typecheck/build and package-boundary inspection               | Feature-level dependency review                        |
| NFR-014 version control               | New isolated `SGRS-rebuild` Git repository                                                       | Git repository and CI config initialized; working tree review | Meaningful milestone commits/PR review                 |
| NFR-015 documentation                 | README, architecture overview, decisions, this RTM                                               | Documentation links/files present                             | Update per feature/migration                           |
| NFR-010 reliable data                 | Prisma schema and migrations                                                                     | Generate, migrate, seed, query/readiness smoke                | Transaction, rollback and backup/restore tests         |
| NFR-019 browser compatibility         | Vite/React runtime                                                                               | Production build                                              | Playwright browser matrix                              |
| NFR-001/002 performance               | API/web runtime foundation                                                                       | No performance claim in Phase 1                               | Measured acceptance targets required before sign-off   |
| NFR-003/004/005/017 security/privacy  | Helmet, CORS allowlist, account/IP rate limit, opaque sessions, CSRF and server-side role guards | API integration and security behavior tests                   | Grievance ownership/need-to-know policies in M3+       |
| NFR-006/020 auditability              | AuditLog schema                                                                                  | Prisma migration and schema inspection                        | Append-only DB policy and audit behavior tests         |
| FR-001–005 auth/roles                 | AuthService, session middleware, auth routes, role guards and login UI                           | Phase 2 integration/unit tests; see M2 test IDs below         | Extend ownership checks with grievance routes in M3+   |
| FR-006–013 submission/draft/evidence  | `modules/grievances` services/routes, private storage adapter, student dashboard/form/detail     | M3 domain, storage and PostgreSQL API tests                   | Ratify limits, storage backend and evidence scanning   |
| FR-014–018 routing/config             | `RoutingService`, transactional Prisma submit, assignment/history/notification/outbox writes     | M3 routing tests and submission integration tests             | Staff/category administration and policy owner review  |
| FR-019–021 directory                  | User list/search/create/update routes and admin account register                                 | Phase 2 API/web tests; account subset implemented             | Staff/category directory and routing eligibility in M6 |
| FR-022–027 status/deadline            | GrievanceStatus, StatusHistory schema                                                            | Enum/model generation                                         | M4 transitions and M3 deadline policy                  |
| FR-028–031 escalation                 | Escalation/EscalationRule schema                                                                 | Unique grievance/level constraint                             | M4/M5 service and worker tests                         |
| FR-032–035 resolution/feedback/reopen | ResolutionCycle/Feedback schema                                                                  | Unique cycle/feedback constraints                             | M5 lifecycle policy tests                              |
| FR-036–039 notifications              | Submission writes recipient-scoped Notification + IN_APP Outbox inside its DB transaction        | M3 integration verifies student/handler/admin notifications   | Inbox, dispatch/retry and delivery cadence in M5/M6    |
| FR-040–043 reporting                  | Relational model foundation                                                                      | None in Phase 1                                               | M6 metric and aggregate privacy tests                  |
| FR-044–045 audit                      | AuditLog schema                                                                                  | Migration                                                     | M6 write/read authorization and immutability tests     |

## Foundation test IDs

- `FND-API-001`: liveness route returns 200 without a database.
- `FND-API-002`: unexpected API errors return a request ID and do not expose internal error text.
- `FND-WEB-001`: foundation shell renders and does not claim product workflows are implemented.
- `FND-DB-001`: Prisma schema validates and client generates.
- `FND-DB-002`: migrations apply to PostgreSQL 16 and seed is repeatable.
- `FND-CI-001`: formatting, lint, typecheck, tests and production build run in CI.

## Phase 1 verification record (2026-10-31)

| Gate                     | Result | Evidence                                                                                            |
| ------------------------ | ------ | --------------------------------------------------------------------------------------------------- |
| Formatting               | PASS   | `pnpm format:check`                                                                                 |
| Lint                     | PASS   | `pnpm lint`                                                                                         |
| TypeScript               | PASS   | `pnpm typecheck`, including API test TypeScript config                                              |
| Automated tests          | PASS   | `pnpm test`: API 3 tests, web 1 test                                                                |
| Production build         | PASS   | `pnpm build`: contracts, API, worker and Vite client                                                |
| Prisma schema            | PASS   | `prisma validate`; client generation succeeds                                                       |
| PostgreSQL migration     | PASS   | `prisma migrate status`: both committed migrations applied                                          |
| Seed repeatability       | PASS   | Seed run twice; aggregate counts remain 5 users, 5 categories, 1 handler mapping, 1 escalation rule |
| Live process health      | PASS   | `/health/live` and `/health/ready` return 200 with PostgreSQL running                               |
| Worker process lifecycle | PASS   | Built worker stays alive without jobs and exits cleanly on SIGINT                                   |
| Git/environment hygiene  | PASS   | New isolated repository; root `.env` ignored; synthetic development identities only                 |

The idle worker package is a process boundary only; no scheduler cadence, job policy or workflow has been implemented. When jobs are added, they must invoke the same application services as manual API operations.

These results verify only the Phase 1 foundation. They do not sign off any grievance workflow, authentication, authorization, notification delivery or scheduled processing behavior.

## Phase 2 authentication test IDs

- `M2-AUTH-001`: each of the five seeded roles can log in, bootstrap its session and log out; the session is rejected after logout.
- `M2-AUTH-002`: unknown, incorrect-password and inactive-account responses use the same public status and message.
- `M2-AUTH-003`: protected account-management routes deny unauthenticated and non-administrator callers; role comes from the session record.
- `M2-AUTH-004`: administrator role/activation updates are audited and revoke existing sessions; the final active administrator cannot be demoted or deactivated.
- `M2-AUTH-005`: cookie-authenticated mutations require same-origin and CSRF proof; logout-all revokes every active session.
- `M2-AUTH-006`: password change verifies the current password, stores a hash, rotates the session and invalidates the old session.
- `M2-AUTH-007`: session storage contains token hashes; absolute expiry denies the session.
- `M2-WEB-001`: the unified login page has no role switch, demo selection fills only email, and server-returned role controls redirect.
- `M2-USER-001`: user provisioning normalizes identity, hashes the initial password and never returns a password hash.

## Phase 2 verification record (2026-10-31)

API integration tests require the local PostgreSQL database and synthetic seed; web tests mock the API.

| Gate                    | Result | Evidence                                                                     |
| ----------------------- | ------ | ---------------------------------------------------------------------------- |
| API auth and user tests | PASS   | 11 API tests: 3 foundation, 6 auth integration, 2 account service unit tests |
| Web auth tests          | PASS   | 3 login and role redirect tests                                              |
| TypeScript and lint     | PASS   | Workspace typecheck and ESLint completed                                     |
| Formatting              | PASS   | `pnpm format:check`                                                          |
| Production build        | PASS   | Contracts, API, worker and Vite web build completed                          |

Authentication is implemented for local email/password accounts only. Grievance ownership and field-level case access checks become testable when grievance endpoints are introduced; Phase 2 does not claim those workflows.

## Phase 3 verification record (2026-10-31)

| Requirement / test ID               | Implementation evidence                                                                      | Verification                                                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M3-GRV-001 draft/validation         | `GrievanceService`, `domain/validation.ts`, student create/edit form                         | Domain tests cover required fields, title ceiling, optional location, active category, valid/future date.                                                 |
| M3-GRV-002 evidence                 | `EvidenceService`, private `LocalEvidenceStorage`, multipart upload/download routes          | Unit tests cover signature validation and per-file rejection; PostgreSQL API integration uploads and retrieves metadata for a valid PDF.                  |
| M3-GRV-003 assignment routing       | `RoutingService` and transaction in `PrismaGrievanceRepository.submit`                       | Unit test covers active, role, date-window eligibility; DB integration covers automatic and no-handler manual assignment.                                 |
| M3-GRV-004 SLA snapshot             | `slaHoursSnapshot`, `slaPolicyVersion`, `resolutionDeadline` persisted at submission         | Integration checks 120-hour seeded Hostel snapshot. Category defaults remain synthetic and unresolved (DEC-003/007).                                      |
| M3-GRV-005 case access              | Student/handler/admin route scopes; management/reviewer excluded                             | API integration asserts student access and management denial; cross-owner and assigned-handler adversarial cases remain required before production.       |
| M3-GRV-006 idempotency/concurrency  | Unique `submission_key`, row lock, optimistic `version`, unique case number                  | Integration retries a key sequentially and concurrently, returning one case with exactly one active assignment. Multi-connection stress remains required. |
| M3-GRV-007 UI                       | Student dashboard, draft form, submission confirmation, detail/history, handler queue        | React build and web tests; browser-level full workflow remains scheduled for later validation.                                                            |
| M3-GRV-008 transaction/audit/outbox | Single transaction writes status history, assignment, notifications, IN_APP outbox and audit | Integration checks final status/assignment and manual notification rows; rollback fault-injection remains outstanding.                                    |

The Phase 3 implementation records provisional rules in `DECISIONS.md`; unresolved source gaps are not treated as ratified policy. No Phase 4 escalation, reviewer, resolution, closure or feedback workflow is claimed.

Phase 3 verification on 2026-10-31: Prettier check, ESLint, workspace TypeScript checks, 22 API tests (including PostgreSQL integration), 4 web tests, production build, `prisma migrate status`, and two consecutive seed runs passed. The PostgreSQL client emits a pg driver deprecation warning during concurrent integration calls; tests pass and the warning originates in current `pg` adapter query overlap behavior.

## Phase 4 requirements and verification

| ID         | Requirement                                                                        | Implementation evidence                                                                 | Verification                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| M4-HND-001 | Handler sees only active assigned queue; search/status/sort/SLA/workload           | `GrievanceService`, `visibleWhere`, `HandlerQueuePage`, `/handler/workload`             | API integration proves role denial; web test verifies controls and workload fetch; full API suite                                                    |
| M4-HND-002 | Handler can begin investigation only from ASSIGNED                                 | `CaseWorkflowService`, serialized repository transition, status history/audit           | API integration verifies success and repeated start returns 409                                                                                      |
| M4-HND-003 | Private remarks and public information request                                     | `CaseMessage` with audience, immutable migration, `GrievanceDetailPage`                 | Integration confirms chronology to handler and no private content to student                                                                         |
| M4-HND-004 | Student replies only to an information request on own case                         | Student-scoped repository operation; request relationship and status checked under lock | Integration verifies reply returns case to UNDER_REVIEW                                                                                              |
| M4-REV-001 | Reviewer queue/detail restricted to reviewer escalation assignment                 | Reviewer queue and `visibleWhere`; reviewer detail route                                | Integration verifies assigned escalation appears; management access denied                                                                           |
| M4-REV-002 | Reviewer directions and successive escalation                                      | Reviewer workflow service and escalation-level records                                  | Integration verifies direction and next level                                                                                                        |
| M4-ESC-001 | Manual escalation requires reason, only valid states, one row per level            | Domain validation, grievance row lock, unique `(grievance_id, level)`                   | Integration verifies blank reason rejected and level creation                                                                                        |
| M4-ESC-002 | Missing reviewer remains in manual queue; administrator can assign active reviewer | `AWAITING_MANUAL`, admin API/UI, assignment notification/outbox/audit                   | Integration verifies missing level and manual assignment                                                                                             |
| M4-SEC-001 | Backend role/ownership checks protect details, messages and evidence               | Role middleware plus scoped repository predicates                                       | Integration tests roles/private message filtering; evidence access included in existing scoped route (full binary evidence adversarial case pending) |
| M4-NOT-001 | Workflow notifications and outbox commit with workflow transaction                 | `createNotification` called inside workflow transactions                                | Integration verifies outbox records exist                                                                                                            |
| M4-AUD-001 | Workflow actions append audit and status history; message history is immutable     | `auditLog`, `statusHistory`, `case_messages_append_only` trigger                        | DB integration observes persisted flow; direct update/delete trigger test remains a production-hardening follow-up                                   |

Phase 4 API suite passed: 25 tests across 9 API test files. Web suite passed: 6 tests. Final Phase 4 verification on 2026-10-31: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and Prisma migration status all passed; PostgreSQL reports four migrations applied. The pg adapter emitted its existing concurrent-query deprecation warning during API tests. DEC-008/009/024/025/026 remain explicitly open as recorded in `DECISIONS.md`; implementation uses the narrow, documented defaults in those rows. No Git commit or push was made.
