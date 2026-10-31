# SGRS Rebuild

A fresh implementation of the Student Grievance Redressal System for LNMIIT Jaipur (CS314, T033). This repository is separate from the supplied prototype. Phases 1–2 establish the monorepo, runtime, PostgreSQL/Prisma foundation, synthetic seed, CI checks and session-based role access. Phase 3 adds grievance drafts, evidence, student submission, automatic category routing, manual-assignment queue status and SLA snapshots.

## Requirements

- Node.js 22.12 or newer (Node 24 is also supported)
- pnpm 11.25.0
- Docker with Docker Compose, or a PostgreSQL 16 instance

## Local setup

```sh
cp .env.example .env
# Set SGRS_SEED_PASSWORD in .env to a private local-only password of at least 12 characters.
pnpm install
pnpm db:up
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

The Vite client runs at `http://127.0.0.1:5173`; its `/api` requests proxy to Fastify at `http://127.0.0.1:4000`. The liveness endpoint is `http://127.0.0.1:4000/health/live`. Readiness executes a database query and returns 503 when PostgreSQL is unavailable or not configured. Local Postgres is published on port 54329 to avoid assuming the default port is free.

The seed creates synthetic accounts for Student, Handler, Reviewer, Administrator and Management. They all receive the password set by `SGRS_SEED_PASSWORD`; seed output never prints it. The ignored root `.env` is the local source of that password. Account emails are listed in [`docs/development/DEMO-ACCOUNTS.md`](docs/development/DEMO-ACCOUNTS.md). The hostnames use `.local` and are not institutional accounts. Category SLA values and the sample Hostel handler/reviewer mappings are illustrative prototype-derived development data only; see `docs/requirements/DECISIONS.md`.

## Useful commands

```sh
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm db:generate
pnpm db:migrate:dev
pnpm db:migrate:deploy
pnpm db:seed
```

## Implemented scope

- `apps/web`: React + TypeScript + Vite foundation.
- `apps/api`: Fastify + TypeScript server, request IDs, baseline security plugins, normalized error envelope, liveness/readiness, local authentication, sessions, role authorization, administrator account lifecycle and Phase 3 grievance/evidence/routing APIs.
- `apps/worker`: separate TypeScript process boundary for future scheduled work; currently starts with no jobs registered.
- `packages/contracts`: serializable shared API contracts only.
- PostgreSQL 16, Prisma ORM 7, versioned migrations and synthetic seed data, including nullable drafts, unique submission keys and frozen category SLA snapshots.
- ESLint, Prettier, strict TypeScript, Vitest and GitHub Actions CI.

Phase 2 local auth uses database-backed opaque sessions, HttpOnly cookies, CSRF validation and server-side roles. Configurable provisional defaults are 30 minutes idle and 12 hours absolute; see [`docs/architecture/AUTHENTICATION.md`](docs/architecture/AUTHENTICATION.md) and [`docs/requirements/DECISIONS.md`](docs/requirements/DECISIONS.md). No institutional SSO, invitation email or password-reset process is implemented.

Phase 3 stores accepted evidence in a private local directory (`apps/api/.data/evidence` by default); configure `EVIDENCE_STORAGE_DIR` for another private path. Files are signature-checked for PDF/JPG/PNG and capped at 5 MiB each. This is not malware scanning or production object storage. No institute SSO, real email delivery, scheduler jobs, reviewer escalation, resolution, closure, feedback, or real user data is included yet. Phase 3 policy defaults and gaps are listed in [`docs/requirements/DECISIONS.md`](docs/requirements/DECISIONS.md), with workflow details in [`docs/architecture/GRIEVANCE-SUBMISSION.md`](docs/architecture/GRIEVANCE-SUBMISSION.md) and the route inventory in [`docs/api/GRIEVANCES.md`](docs/api/GRIEVANCES.md).
