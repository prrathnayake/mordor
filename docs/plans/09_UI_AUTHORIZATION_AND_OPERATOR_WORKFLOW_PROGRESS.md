# UI Authorization and Operator Workflow Progress

## Date
2026-04-05

## Phase
UI Authorization and Operator Action Workflow (Phase 9)

## Scope Implemented
- Login/session handling in web app
- Role-aware UI (viewer/operator/admin)
- Session UI showing current user and role
- Auth token persistence in localStorage
- Permission-gated alert controls:
  - Close button visible only for operator/admin
  - Alert detail shows different messaging based on role
- Backend role enforcement (operator required for alert PATCH)

## Runtime Paths Working
1. Login flow:
   - Login form appears when button clicked
   - Credentials sent to /auth/login
   - Token stored in localStorage
   - Session UI updates with username and role

2. Permission-gated UI:
   - Viewer: sees alerts but no close button
   - Operator/Admin: sees close button on alerts
   - Alert detail shows login prompt for viewers

3. Alert close flow:
   - Operator clicks close button
   - PATCH request with auth token
   - Success reloads alerts, error shows message

## Exit Evidence
- TypeScript typecheck passes
- biome lint passes
- All gate checks pass
- 105 unit/integration tests pass
- 16 e2e tests pass (8 replay-web + 8 new auth tests)

## Files Changed in This Phase
- apps/web/public/index.html - Added login section
- apps/web/public/app.js - Session handling, auth UI, permission-gated alerts
- apps/web/public/styles.css - Login form and alert action styles
- tests/e2e/authorization-web.spec.ts - New auth e2e tests
- tests/integration/alert-api.spec.ts - Added role-based API tests

## Tests Added
### E2E (8 new tests)
- Shows login button when not authenticated
- Login form appears when login button clicked
- Successful login updates session UI
- Login with invalid credentials shows error
- Logout clears session
- Operator can see close button on alerts
- Viewer cannot see close button on alerts
- Replay loads correctly under authenticated session

### Integration (3 new tests)
- Operator can close alert via PATCH
- Viewer cannot close alert via PATCH (403)
- Unauthenticated request to close alert returns 401
