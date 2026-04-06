# Phase 11: Auth Hardening and Session Lifecycle

## Status: Complete

## Date: 2026-04-05

## Summary
Hardened the authentication flow by implementing token validation on page load, session expiration handling, and proper handling of expired/invalid tokens.

## Implementations

### Token Expiration
- Added 30-minute token expiration in `packages/auth/src/service.ts`
- Token metadata now includes `createdAt` and `expiresAt` fields
- Added `isTokenExpired()` function to check if token is expired
- Added `getTokenExpiry()` function to get token expiration time

### Frontend Session Lifecycle
- Added `/auth/validate` endpoint in server.ts for frontend token validation
- Added `validateSession()` function in frontend to validate stored tokens on page load
- Added `handleUnauthorized()` function for consistent 401/403 handling
- Token is cleared from localStorage when invalid/expired on page load

### Error Handling
- Added `error` field to `AuthContext` interface in models.ts
- Improved authenticated UX behavior for error states
- Updated closeAlert to use handleUnauthorized for cleaner error handling

## Tests

### Unit Tests
- Added token expiration tests in `tests/unit/auth.spec.ts`:
  - `getTokenExpiry` returns valid expiry time for token
  - `getTokenExpiry` returns null for invalid token
  - `isTokenExpired` returns false for valid token
  - `isTokenExpired` returns true for invalid token
  - `validateToken` returns error for expired token

### Integration Tests
- Added `/auth/validate` endpoint tests in `tests/integration/alert-api.spec.ts`:
  - Returns user for valid token
  - Returns 401 for invalid token

### E2E Tests
- Added session lifecycle tests in `tests/e2e/session-lifecycle.spec.ts`:
  - Login persists session across page reload
  - Invalid stored token is cleared on page load
  - Logout clears session completely
  - Replay works after session is re-established

## Files Modified

- `packages/auth/src/service.ts` - Token expiration logic
- `packages/auth/src/models.ts` - Added error field to AuthContext
- `apps/api/src/server.ts` - Added /auth/validate endpoint
- `apps/web/public/app.js` - Token validation, handleUnauthorized, session lifecycle
- `tests/unit/auth.spec.ts` - Added expiration tests
- `tests/integration/alert-api.spec.ts` - Added /auth/validate tests
- `tests/e2e/session-lifecycle.spec.ts` - New e2e tests (created)

## Test Results
- All 113 unit/integration tests pass
- All 4 session-lifecycle e2e tests pass
- TypeScript and biome checks pass
