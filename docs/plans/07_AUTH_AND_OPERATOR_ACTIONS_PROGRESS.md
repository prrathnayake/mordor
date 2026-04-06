# Authentication, Roles, and Operator Actions Progress

## Date
2026-04-05

## Phase
Authentication, Roles, and Operator Actions (Phase 7)

## Scope implemented
- Auth package with role model (viewer, operator, admin)
- Authentication via /auth/login endpoint with mock users
- Token-based auth (Bearer token in Authorization header)
- Authorization checks on:
  - /ingest/fixture-telemetry (requires operator+)
  - /ingest/camera-observation (requires operator+)
  - /alerts GET (requires authenticated)
  - /alerts/:id GET (requires authenticated)
  - /alerts/:id PATCH (requires operator+)
- Audit logging for alert status changes
- Role hierarchy: admin > operator > viewer

## Runtime paths now working
1. Login path
   `POST /auth/login {username, password} -> token + user info`
2. Authenticated request path
   `Authorization: Bearer <token> -> validateToken -> authContext`
3. Protected endpoint path
   `check authContext.user.role >= requiredRole -> 401/403 or proceed`
4. Alert action audit path
   `PATCH /alerts/:id -> recordAuditLog -> audit_logs table`

## Notable boundaries preserved
- Auth package in packages/auth/ (authorization logic)
- API server handles auth middleware
- No frontend auth logic beyond sending headers
- Audit logs via persistence package

## Current limitations by design
- Mock users only (no real user database)
- No token expiration
- No role management API
- No user registration
- Ingest requires operator+ (not admin-only)

## Exit evidence
- TypeScript typecheck passes
- biome lint passes (clean, no warnings)
- all gate checks pass
- 11 new auth unit tests pass
- 78 unit/integration tests pass
- 8 e2e tests pass (updated with auth token)

## Files changed in this phase
- packages/auth/src/models.ts - Role types, User, permission functions (new)
- packages/auth/src/service.ts - authenticate, validateToken, logout (new)
- packages/auth/src/middleware.ts - auth middleware, requireAuth, requireRole (new)
- packages/auth/src/index.ts - exports (new)
- apps/api/src/server.ts - auth middleware, protected endpoints, audit logging
- tests/unit/auth.spec.ts - auth unit tests (new)
- tests/e2e/replay-web.spec.ts - updated with auth token

## Auth tests added
- authenticate: valid credentials, invalid password, unknown user
- validateToken: valid token, invalid token, empty token
- logout: removes token
- getUserFromToken: valid token, invalid token
