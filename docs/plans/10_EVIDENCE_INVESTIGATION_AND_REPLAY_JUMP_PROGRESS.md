# Evidence Investigation and Replay Jump Progress

## Date
2026-04-05

## Phase
Evidence Investigation UX and Replay Jump (Phase 10)

## Scope Implemented
- Alert detail panel with evidence display
- Jump to Replay button from alert
- Back button to return to alert list
- Close alert from detail panel
- Evidence chain visibility (triggering events, related objects, rule, timestamps)
- Investigation workflow: view alert → see evidence → jump to replay → investigate

## Runtime Paths Working
1. Alert Detail Panel:
   - Click alert → shows detail panel with full evidence
   - Displays: summary, severity, status, explanation, rule, triggering events, related objects, timestamps

2. Alert-to-Replay Navigation:
   - Click "Jump to Replay" button
   - Auto-fills start/end time (±5 min from alert opened_at)
   - Auto-fills object_id from first evidence_object_id
   - Switches to replay mode and loads replay

3. Alert Actions:
   - Close button available for operator/admin
   - Works from detail panel
   - Back button returns to alert list

## Exit Evidence
- TypeScript typecheck passes
- biome lint passes
- All gate checks pass
- 106 unit/integration tests pass
- 22 e2e tests pass (8 replay + 8 auth + 6 new investigation)

## Files Changed in This Phase
- apps/web/public/index.html - Added alert detail panel
- apps/web/public/app.js - Alert detail UI, jump to replay, evidence display
- apps/web/public/styles.css - Alert detail panel and action button styles
- tests/e2e/investigation-web.spec.ts - 6 new investigation e2e tests
- tests/integration/alert-api.spec.ts - Added evidence detail test

## Tests Added
### E2E (6 new tests)
- Alert detail panel shows evidence
- Jump to replay button loads relevant time window
- Back button returns to alert list
- Close alert button works from detail panel
- Investigation flow works under authenticated session
- Live mode still works after alert investigation

### Integration (1 new test)
- Returns alert with full evidence details
