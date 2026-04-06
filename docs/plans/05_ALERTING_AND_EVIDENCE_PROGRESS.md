# Alerting, Evidence Chain, and Operator Workflow Progress

## Date
2026-04-05

## Phase
Alerting, Evidence Chain, and Operator Workflow (Phase 5)

## Scope implemented
- Alert rules engine with 4 rules:
  - Object stale detection (object not reporting > 5 min)
  - Source error detection (critical)
  - Source disconnection detection (critical)
  - Low speed detection (info, < 0.5 mph)
- Alert evaluation during event ingestion
- Alert persistence to PostgreSQL
- Alert API endpoints (GET /alerts, GET /alerts/:id, PATCH /alerts/:id)
- Alert filtering by status and severity
- Evidence chain via evidence_event_ids and evidence_object_ids
- Web UI alert list and detail panel

## Runtime paths now working
1. Alert rule evaluation path
   `canonical_event -> evaluateEventForAlerts -> AlertEvaluationResult[] -> persistAlert`
2. Alert API path
   `GET /alerts?status=open -> fetchAlerts -> JSON response`
3. Alert status update path
   `PATCH /alerts/:id {status} -> updateAlertStatus -> fetchAlert -> return updated`
4. Alert web UI path
   `load alerts on page -> display in alert panel -> click to inspect`

## Notable boundaries preserved
- Alert rules engine in packages/alerts/ (domain logic)
- Alert persistence in packages/persistence/ (data layer)
- Alert API endpoints in apps/api/ (API concern)
- Evidence stored as arrays (PostgreSQL TEXT[])
- No alert suppression/deduplication (by design)

## Current limitations by design
- No alert history (only current state)
- No alert rules configuration API (hardcoded rules)
- No alert acknowledgment UI in web (PATCH via curl/API only)
- No alert replay jump (future phase)

## Exit evidence
- TypeScript typecheck passes
- biome lint passes (clean, no warnings)
- all gate checks pass
- 69 unit/integration tests pass (4 new alert rule tests + 7 new alert API tests)
- 8 e2e tests pass
- Alert rules unit tests cover:
  - evaluateObjectStaleRule (stale, not stale, null state, evidence)
  - evaluateSourceErrorRule (error event)
  - evaluateSourceDisconnectedRule (disconnection, non-disconnection)
  - evaluateLowSpeedRule (slow, normal speed)
  - evaluateEventForAlerts (multiple rules)
- Alert API integration tests cover:
  - store and fetch alert
  - fetch single alert by ID
  - 404 for non-existent alert
  - update alert status via PATCH
  - filter by status
  - filter by severity
  - empty list when no alerts

## Files changed in this phase
- packages/alerts/src/rules.ts - Alert rules engine (new)
- packages/alerts/src/types.ts - Alert types (new)
- packages/alerts/src/index.ts - Package exports (new)
- packages/persistence/src/postgres-persistence.ts - Alert persistence methods
- apps/api/src/server.ts - Alert API endpoints
- apps/web/public/index.html - Alert panel in UI
- apps/web/public/app.js - Alert loading logic
- apps/web/public/styles.css - Alert panel styles
- infra/migrations/0001_initial_schema.sql - Alert table with acknowledged_at columns
- biome.json - Disable noImportantStyles rule for .hidden class
- tests/unit/alert-rules.spec.ts - Added evaluateSourceDisconnectedRule tests
- tests/integration/alert-api.spec.ts - Alert API integration tests (new)
