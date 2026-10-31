# Phase 1 runtime foundation

## Boundary

`apps/web` is a React/Vite browser client. `apps/api` is a Fastify TypeScript process. `apps/worker` is a separate process boundary for future scheduler and asynchronous jobs; Phase 1 starts an idle worker with no registered jobs. `packages/contracts` shares transport-level enums/DTOs only. The web application never imports Prisma or database code. Domain and business behavior remain server-side; routes will validate and delegate to application services in later milestones. PostgreSQL is accessed by Prisma ORM 7 with the `pg` driver adapter. Future API operations and worker jobs must call shared application services.

## Runtime

- Local database: PostgreSQL 16 via `docker compose`; persistent volume is `sgrs-postgres-data`.
- Web: Vite on `127.0.0.1:5173`.
- API: Fastify on `127.0.0.1:4000`.
- Worker: separate Node process started by `pnpm dev`; currently idle by design.
- Shared environment: root `.env`, ignored by Git; `.env.example` has development-only values.
- API plugins: Helmet, CORS restricted to `WEB_ORIGIN`, rate limit, request ID and normalized error handling.
- `/health/live` checks only the process. `/health/ready` executes `SELECT 1` against PostgreSQL and returns 503 if it is unconfigured or unavailable.

## Database model scope

The initial schema includes users/sessions, departments, categories/category handlers, escalation rules, grievances, assignment history, evidence metadata, status history, case messages, escalation levels, resolution cycles/feedback, notifications/outbox, audit events and job runs. Schema fields are structural and do not imply unresolved transition, SLA, retention or privacy rules have been approved. Prisma migrations are committed; do not use `db push` as a substitute for migration history.

## CI

GitHub Actions uses PostgreSQL 16 and runs install, format check, lint, Prisma client generation, migration deploy, seed, typecheck, tests and production build. The seed requires a CI-only environment password and contains synthetic identities only.
