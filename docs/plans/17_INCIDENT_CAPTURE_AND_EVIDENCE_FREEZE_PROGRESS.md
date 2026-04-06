# Phase 17: Incident Capture and Evidence Freeze Progress

## Date
2026-04-06

## Goal
Make MORDOR capable of preserving reconstruction inputs during unfolding events by adding incident watch/capture jobs, source snapshotting, evidence freeze, capture status visibility, and replayable preserved input sets for later investigation.

## Implementation Summary

### 1. Capture Job Model
- Created `packages/contracts/src/capture-models.ts` with:
  - `CaptureJob` - main capture job entity
  - `CaptureSnapshot` - individual source snapshots
  - `EvidenceFreeze` - frozen evidence records
  - `CaptureJobDetail` - job with snapshots and freeze info
  - `IncidentCaptureStatus` - aggregate capture status
  - Constants for statuses: `CAPTURE_JOB_STATUSES`, `CAPTURE_SOURCE_TYPES`, `FREEZE_STATUSES`

### 2. Database Migration
- Created `infra/migrations/0004_capture_jobs.sql` with:
  - `capture_jobs` table - main capture job records
  - `capture_snapshots` table - individual source snapshots
  - `evidence_freeze` table - frozen evidence records
  - Triggers for automatic snapshot count updates
  - Triggers for freeze status updates
  - Views: `incident_capture_status_view`, `capture_job_detail_view`

### 3. Persistence Gateway
- Added to `packages/persistence/src/postgres-persistence.ts`:
  - `createCaptureJob()` - create new capture job
  - `getCaptureJob()` - fetch capture job by ID
  - `listCaptureJobs()` - list jobs with optional filters
  - `startCaptureJob()` - mark job as running
  - `completeCaptureJob()` - mark job as completed/failed
  - `addCaptureSnapshot()` - add snapshot to job
  - `listCaptureSnapshots()` - list snapshots for job
  - `freezeSnapshots()` - freeze all snapshots in job
  - `createEvidenceFreeze()` - create freeze record
  - `getEvidenceFreeze()` - get freeze record
  - `listEvidenceFreeze()` - list evidence for incident
  - `getIncidentCaptureStatus()` - get aggregate capture status

### 4. API Endpoints
- Added to `apps/api/src/server.ts`:
  - `POST /incidents/:id/capture-jobs` - create capture job
  - `GET /incidents/:id/capture-jobs` - list capture jobs
  - `GET /capture-jobs/:id` - get capture job detail
  - `POST /capture-jobs/:id/start` - start capture job
  - `POST /capture-jobs/:id/run` - start and execute capture job
  - `POST /capture-jobs/:id/complete` - complete capture job
  - `GET /capture-jobs/:id/snapshots` - list snapshots
  - `POST /capture-jobs/:id/freeze` - freeze evidence
  - `GET /incidents/:id/evidence` - list frozen evidence
  - `GET /incidents/:id/capture-status` - get capture status

### 5. Source Snapshotting
- Created `apps/api/src/capture-service.ts` with source-specific snapshotting:
  - `captureFlights()` - captures latest object states
  - `captureEarthquakes()` - captures earthquakes within time range
  - `captureSatellites()` - captures satellite positions
  - `captureWeather()` - captures weather alerts
  - `captureBikeshare()` - captures bikeshare station data
  - `captureTraffic()` - captures traffic incidents
  - `captureAlerts()` - captures alerts within time range
  - `captureEvents()` - captures canonical events
  - `captureCCTV()` - snapshot-only (no data capture)
  - `runCaptureJob()` - orchestrates full capture lifecycle

### 6. Evidence Freeze
- Integrated into persistence with:
  - Automatic freeze status tracking via triggers
  - Snapshot freezing mechanism
  - Evidence freeze records with metadata

### 7. Tactical UI
- Updated `apps/web/public/index.html`:
  - Added capture section in incident panel
  - Added capture job list container
  - Added evidence list container
  - Added capture source modal

- Updated `apps/web/public/tactical-styles.css`:
  - Added styles for capture section header
  - Added styles for capture job items
  - Added styles for evidence items
  - Added styles for capture source modal
  - Added styles for capture buttons

- Updated `apps/web/public/app.js`:
  - Added capture panel DOM elements
  - Added capture state management
  - Added `loadCaptureJobs()` - loads jobs for incident
  - Added `loadEvidence()` - loads evidence for incident
  - Added `renderCaptureJobs()` - renders job list
  - Added `renderEvidenceList()` - renders evidence list
  - Added `createCaptureJob()` - creates new job
  - Added `runCaptureJob()` - runs capture job
  - Added `freezeEvidence()` - freezes evidence
  - Added `showCaptureSourceModal()` - shows source selection
  - Added `getSourceDisplayName()` - gets display name for source type

### 8. Tests

#### Unit Tests
- Created `tests/unit/capture-models.spec.ts`:
  - Tests for CAPTURE_JOB_STATUSES constant
  - Tests for CAPTURE_SOURCE_TYPES constant
  - Tests for FREEZE_STATUSES constant
  - Tests for CaptureJob interface
  - Tests for CaptureSnapshot interface
  - Tests for EvidenceFreeze interface
  - Tests for CreateCaptureJobRequest interface

#### Integration Tests
- Created `tests/integration/capture-api.spec.ts`:
  - Creates capture job for incident
  - Lists capture jobs for incident
  - Starts capture job
  - Runs capture job end-to-end
  - Gets capture job detail
  - Freezes evidence
  - Gets evidence list for incident
  - Gets capture status for incident
  - Returns 401 without auth token
  - Returns 400 for invalid source type

#### E2E Tests
- Created `tests/e2e/capture-workflow.spec.ts`:
  - Capture section exists in incident panel
  - Capture section has add button
  - Capture job list container exists
  - Evidence list container exists
  - Opens capture source modal
  - Shows all source options in modal
  - Closes capture modal
  - Creates capture job via API
  - Lists capture jobs for incident
  - Runs capture job
  - Freezes evidence
  - Gets capture status
  - Gets evidence list
  - Regression: live mode works
  - Regression: replay mode works
  - Regression: alerts strip visible
  - Regression: incident panel works
  - Regression: layer toggles work

## Sources Supported for Snapshotting

| Source Type | Status | Description |
|-------------|--------|-------------|
| flights | ✅ Real | Captures latest object states from tracked objects |
| earthquakes | ✅ Real | Captures earthquakes within incident time range |
| satellites | ✅ Real | Captures satellite positions (last 500) |
| weather | ⚠️ Degraded | Captures weather alerts within time range |
| bikeshare | ✅ Real | Captures bikeshare station data (last 200) |
| traffic | ⚠️ Degraded | Captures traffic incidents within time range |
| cctv | ⚠️ Snapshot Only | No data capture (placeholder) |
| alerts | ✅ Real | Captures alerts within incident time range |
| events | ✅ Real | Captures canonical events within time range |

## Files Created

- `packages/contracts/src/capture-models.ts`
- `infra/migrations/0004_capture_jobs.sql`
- `apps/api/src/capture-service.ts`
- `tests/unit/capture-models.spec.ts`
- `tests/integration/capture-api.spec.ts`
- `tests/e2e/capture-workflow.spec.ts`
- `docs/plans/17_INCIDENT_CAPTURE_AND_EVIDENCE_FREEZE_PROGRESS.md`

## Files Modified

- `packages/contracts/src/index.ts` - Added capture-models export
- `packages/persistence/src/postgres-persistence.ts` - Added capture methods
- `apps/api/src/server.ts` - Added capture endpoints
- `apps/api/src/index.ts` - (implicit - API server)
- `apps/web/public/index.html` - Added capture section
- `apps/web/public/tactical-styles.css` - Added capture styles
- `apps/web/public/app.js` - Added capture functions
- `tests/e2e/incident-playback.spec.ts` - Added regression tests

## Validations

- ✅ TypeScript compiles without errors
- ✅ Biome lint passes (0 errors)
- ✅ Gate checks pass (docs, architecture, contracts, adapters)

## Next Steps / Remaining Gaps

1. Unit tests for capture service (source snapshotting logic)
2. Additional E2E tests for UI interactions
3. Integration with incident timeline correlation
4. Snapshot payload validation and viewing
5. Freeze evidence verification (snapshot integrity)
