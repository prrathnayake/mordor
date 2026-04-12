# Swan Protocol Runbook

## Purpose
Swan v1 is an opt-in background enrichment protocol for the tactical UI. It listens to semantic user activities, schedules lightweight research threads in the API process, stores advisory findings in PostgreSQL, and publishes derived JSON projections for live UI updates.

## Runtime model
- Session enable: `POST /swan/session`
- Activity ingestion: `POST /swan/activity`
- Session lookup: `GET /swan/session`
- Findings query: `GET /swan/findings`
- Artifact read: `GET /swan/artifacts/:sessionId/:artifactKey`
- Session disable: `DELETE /swan/session`

The shared `/live/events` stream publishes:
- `swan_session_update`
- `swan_thread_update`
- `swan_projection_update`
- `swan_notification`

## Artifact layout
Each active Swan session writes projections under:

```text
runtime/swan/<session_id>/
  session.json
  panels.json
  map.json
  notifications.json
  threads/<thread_id>.json
```

Write order is:
1. persist artifact metadata in PostgreSQL
2. materialize JSON atomically with temp-file then rename
3. publish SSE update

## Activity capture rules
The browser helper should emit only semantic actions:
- object select
- alert open
- incident open
- live or replay mode switch
- replay query submit
- layer toggle
- map selection change
- Swan or auth session lifecycle context

Do not emit:
- raw pointer streams
- hover noise
- keystroke telemetry
- background polling chatter

## Scheduling rules
Recipe mapping:
- object select -> `context`, `verify`, `research`
- alert or incident open -> `context`, `watch`, `research`
- live mode or replay query -> `window_watch`, `research`
- layer toggle on -> `layer_watch`

Boundaries:
- dedupe identical activity keys for 2 seconds
- recurring watch cadence defaults to 60 seconds
- idle sessions expire after 30 minutes
- cancel queued and running work when the Swan session is disabled or expires

## Verification rules
Allowed finding verification states:
- `unverified`
- `single_source`
- `cross_checked`
- `trusted_source`

Projection gating:
- panel detail may show all findings
- notifications and map overlays are restricted to `cross_checked` and `trusted_source`

## Operational checks
When debugging Swan:
1. confirm the user is authenticated and the browser is sending `X-Client-Session-Id`
2. check `GET /swan/session` for an active session
3. inspect `swan_threads` and `swan_findings` for queued, running, failed, or cancelled work
4. read `runtime/swan/<session_id>/session.json` and related projection files
5. watch `/live/events` for Swan projection and notification traffic

## Configuration
Default environment values:
- `SWAN_ARTIFACT_ROOT=./runtime/swan`
- `SWAN_MAX_THREADS_PER_SESSION=5`
- `SWAN_MAX_GLOBAL_THREADS=20`
- `SWAN_SESSION_IDLE_TTL_MS=1800000`
- `SWAN_WATCH_INTERVAL_MS=60000`
- `SWAN_PROVIDER_ALLOWLIST=app_context,existing_external_layers,external_research`

## Safety notes
- Swan output is advisory and must not overwrite canonical truth
- external research providers may store metadata and source URLs only
- every finding should preserve provenance and verification status back to the UI
