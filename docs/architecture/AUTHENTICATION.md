# Phase 2 authentication and account access

This phase implements local email/password authentication and account administration for the five documented SGRS roles. It does not connect to LNMIIT identity services and does not implement grievance workflows.

## Request and session flow

1. `POST /api/v1/auth/login` accepts a normalized email and password. The response for an unknown account, inactive account or incorrect password is the same `401 INVALID_CREDENTIALS` message.
2. The API generates a 256-bit opaque session token and a separate CSRF token. PostgreSQL stores SHA-256 hashes only. The raw session token is sent in an HttpOnly cookie; the CSRF token is in a readable same-site cookie so the SPA can echo it in `X-CSRF-Token`.
3. Cookie-authenticated mutations validate both the configured web origin and matching CSRF cookie/header. The backend looks up the session for every protected request and derives the user ID and role from PostgreSQL.
4. Session activity updates `last_seen_at`. Reaching either the idle deadline or absolute expiry revokes the session and returns 401. Logout revokes the current session; logout-all revokes all the account's active sessions.
5. Password change verifies the current password, stores a new bcrypt hash, revokes existing sessions and issues a replacement session in one database transaction.

Production cookies use the `__Host-` prefix, `Secure`, `HttpOnly` for the session cookie, `Path=/`, and `SameSite=Lax`. Local development omits `Secure` because its Vite/API proxy uses HTTP. Cookies have no `Domain` attribute. HTTPS is required in production.

## Role and account policy

- The user record has one primary role: `STUDENT`, `HANDLER`, `REVIEWER`, `ADMINISTRATOR` or `MANAGEMENT`.
- Each API request is authorized from the active database-backed session. The client does not send or choose its effective role.
- Only `ADMINISTRATOR` can list, create and update accounts. Management has no account-directory access.
- Role, email or deactivation changes revoke existing sessions for that account. Account changes and session changes are written to append-only `audit_log` events in the same transaction as the state change.
- Account deletion is not exposed; deactivation preserves account references and audit history.
- An account creation request supplies an initial password. Password reset, invitation delivery, first-login change enforcement and institutional credential provisioning remain unresolved; see DEC-015.
- At least one active administrator is preserved by a serialized database mutation guard. This lockout-prevention measure is a provisional recommendation, not an additional product authorization policy; see DEC-016.

## Implemented REST routes

| Method and path                     | Authorization                                                    | Behavior                                                                                             |
| ----------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/login`           | Public; same-origin and account/IP rate limited                  | Authenticate, create persisted session, set session and CSRF cookies; generic credential failure.    |
| `GET /api/v1/auth/session`          | Authenticated                                                    | Return safe profile and absolute expiry for frontend bootstrap.                                      |
| `GET /api/v1/me`                    | Authenticated                                                    | Return the current safe profile.                                                                     |
| `POST /api/v1/auth/logout`          | Same-origin; CSRF required for an active session                 | Revoke current session and clear cookies; safe to repeat after logout.                               |
| `POST /api/v1/auth/logout-all`      | Authenticated administrator-independent user; same-origin + CSRF | Revoke all active sessions for the current user and clear cookies.                                   |
| `PATCH /api/v1/auth/password`       | Authenticated; same-origin + CSRF                                | Verify current password, change hash and rotate session.                                             |
| `GET /api/v1/admin/users`           | Administrator                                                    | Filtered and bounded account listing.                                                                |
| `POST /api/v1/admin/users`          | Administrator; same-origin + CSRF                                | Create an account with a required initial password.                                                  |
| `PATCH /api/v1/admin/users/:userId` | Administrator; same-origin + CSRF                                | Update identity, role, department, contact or active state; audit and revoke sessions when required. |

`DELETE` is intentionally absent. The list endpoint accepts `q`, `role`, `active`, `page` and `pageSize`; page size is capped at 100. Safe user DTOs never contain password hashes or session data.

## Session and rate-limit settings

The source documents require session expiry and protection but do not specify durations. Phase 2 uses configurable defaults to make the approved local workflow testable:

- `SESSION_IDLE_TIMEOUT_MINUTES=30`
- `SESSION_ABSOLUTE_TIMEOUT_HOURS=12`
- `AUTH_LOGIN_MAX_ATTEMPTS=10`
- `AUTH_LOGIN_WINDOW_SECONDS=900`

The login limiter keys requests by remote IP plus normalized email. The foundation's global IP limiter remains active as a second bound. Both use the in-memory Fastify store and reset on process restart; a shared store and final production thresholds must be selected before horizontal scaling. These values are recommendations, not institution-approved policy (DEC-011 and DEC-017).

Passwords are hashed with bcryptjs at cost 12, consistent with the existing seed approach. New passwords require at least 12 characters and no more than 72 UTF-8 bytes; this is an implementation validation boundary and should be reviewed before production accounts are provisioned.

## Layers and source of truth

- HTTP routes validate request shapes, apply authentication/role/CSRF guards and serialize safe response DTOs.
- `AuthService` handles credentials, token issuance, password verification and session policy.
- `UserService` handles normalized account creation/update rules and safe DTO mapping.
- `PrismaAuthRepository` owns persistence transactions, account/session writes and audit inserts.
- The web app uses `/api/v1` through the Vite same-origin proxy; it never imports Prisma or reads database state.

The Phase 1 `sessions` and `audit_log` schema already contained the required fields, so this milestone adds no database migration. Audit writes, account state changes, session revocation and password rotation use PostgreSQL transactions. Administrator account mutations share a PostgreSQL advisory transaction lock; target rows are locked before update to prevent last-admin races.

## Verification

The API integration suite uses the five synthetic seeded roles and the local PostgreSQL database. It verifies sign-in/out, protected role access, generic credential failures, deactivation/session revocation, role-change audit, last-administrator protection, CSRF rejection, logout-all, password rotation and absolute session expiry. See [`TRACEABILITY.md`](../requirements/TRACEABILITY.md) and [`DECISIONS.md`](../requirements/DECISIONS.md).
