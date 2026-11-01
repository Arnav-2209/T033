# M8 release hardening and handoff

## What this gate verifies

M8 is the project handoff gate, not a production deployment. It verifies a fresh PostgreSQL schema and synthetic accounts, role-authenticated browser paths, automated accessibility checks on the public and five role homes, private-case workflow behavior, security controls, build/lint/type checks, and operator setup instructions.

## Required local tools

- Node.js 22.12 or later and pnpm 11.25.0.
- PostgreSQL 16, reachable through a dedicated disposable test database.
- Playwright Chromium dependencies. Run `pnpm exec playwright install chromium` once on the workstation.
- Docker Compose is the supported local Postgres option; it publishes port `54329`.

## Clean local setup

1. Copy `.env.example` to `.env`. Set a private synthetic `SGRS_SEED_PASSWORD` (at least 12 characters; maximum 72 UTF-8 bytes). Do not use institutional credentials or case data.
2. Install dependencies with `pnpm install --frozen-lockfile`.
3. Start Postgres with `pnpm db:up`, then migrate and seed using `pnpm db:migrate:deploy` and `pnpm db:seed`.
4. Start the app with `pnpm dev`. Verify `/health/live` and `/health/ready`; the landing page is at `http://127.0.0.1:5173`.
5. Run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

## Browser end-to-end verification

Integration and E2E tests create grievance histories, so both suites now recreate separate disposable databases (`sgrs_test` and `sgrs_e2e`) before each run and drop them afterward. They refuse any other database name. Local tests derive those URLs only from the documented `sgrs` or `sgrs_demo` source URL; CI supplies explicit URLs. Never point test URLs at personally meaningful data. The browser harness starts an isolated API on port 4400 and Vite on port 4173; it does not reuse the user's app ports. The API origin, cookie policy and database are isolated from the normal development server.

The default `pnpm test` command recreates `sgrs_test`, applies migrations and synthetic seed data, runs API/web/worker suites, and drops that database even if a test fails. The default `pnpm e2e` command does the same lifecycle for `sgrs_e2e`. Each runner validates its exact database name before dropping or creating anything. Set `TEST_DATABASE_URL` and `E2E_DATABASE_URL` explicitly in CI.

```sh
pnpm exec playwright install chromium
pnpm e2e
```

The E2E suite uses the `.env` seed password. It covers all five server-selected role destinations, student denial of an administrator route, the public-to-login path, responsive/reduced-motion availability, axe WCAG 2.1 A/AA checks, student submission, handler private-note and information-request behavior, student response, handler resolution, feedback closure, manual escalation and reviewer resolution. Its isolated API process raises only the general request ceiling to avoid throttling deterministic browser navigation; the normal API default remains 100 requests per minute and the login-specific account/IP throttle remains unchanged. It creates rows in the disposable E2E database; drop and recreate that database for a clean subsequent run.

## CI behavior

GitHub Actions creates a fresh PostgreSQL 16 service for each run. The integration and E2E runners independently create, migrate, seed, test, and drop separate disposable databases. CI also runs formatting/lint/typecheck, installs Playwright Chromium, then builds all production packages. CI never reads a developer `.env`.

## Production readiness boundaries

The repository is not ready for production data until the institution supplies deployment infrastructure and approves unresolved decisions. Current boundaries include local filesystem evidence storage without antivirus scanning; no institutional SSO, password reset/invitation email, notification email sender or deadline-reminder cadence; open retention/backup and recovery objectives; provisional SLA/routing/reporting policy; and reopening disabled under DEC-010. Configure TLS, production secrets, database backups/restore tests, monitored storage, log retention, and operational alerting in the target environment before importing real records.

## Release evidence to attach

- CI run URL and commit SHA.
- Prisma migration status from an empty PostgreSQL 16 database.
- Seed repeatability result and synthetic account smoke-test result.
- Complete formatting, lint, typecheck, unit/integration, Playwright and build results.
- Accessibility violation report and screenshots/traces for any failure.
- Manual keyboard, reduced-motion, and visual review at 390px, 768px, and 1440px.
- Open-decision review against `docs/requirements/DECISIONS.md`; do not convert unresolved policy into production defaults without owner approval.
