# Incident Intelligence

Chrona Twin now includes an incident-intelligence lane for collecting public-source articles,
images, videos, and generated widget manifests around an incident.

## Purpose

This layer is intended to support investigation and world-simulation workflows where an operator
opens an incident and needs:

- related article discovery
- media discovery
- provenance summaries
- generated dashboard widgets that can expand the incident view without arbitrary runtime code

## Runtime Shape

### Storage

The incident-intelligence workflow persists three table families:

- `incident_intelligence_artifacts`
- `incident_intelligence_runs`
- `incident_widget_manifests`

Artifacts store normalized references to external articles, images, videos, and reports. Widget
manifests store declarative UI payloads that the web client can render safely through fixed
component logic.

### Collection

Collection logic lives in `packages/intelligence/src/service.ts`.

Current provider set:

- GDELT article discovery
- Openverse image discovery
- optional YouTube video discovery when `YOUTUBE_API_KEY` is configured

Collectors normalize their results into the shared incident-intelligence artifact contract and
record a run status for each provider invocation.

### API

The API exposes:

- `GET /incidents/:id/intelligence`
- `POST /incidents/:id/intelligence/refresh`

The refresh route runs the collector service for a specific incident, persists artifacts and widget
manifests, and emits a live event so connected dashboards can refresh the currently open incident.

### Live Updates

The shared live event bus now includes `incident_intelligence_update`.

That event publishes:

- `incident_id`
- `artifact_count`
- `widget_count`
- `run_count`
- `updated_at`

### Worker and Background Refresh

`apps/worker` now supports an `incident-intelligence` mode for one-off or sweep-style collection.
The API server also supports an opt-in background sweep over open and investigating incidents via:

- `AUTO_REFRESH_INCIDENT_INTELLIGENCE=true`
- `INCIDENT_INTELLIGENCE_REFRESH_MS`
- `INCIDENT_INTELLIGENCE_MAX_INCIDENTS_PER_SWEEP`

## UI Safety Model

Agents and collectors do not write arbitrary frontend code. Instead they populate
`incident_widget_manifests`, and the web client renders only known widget types.

Current widget types:

- `summary`
- `map_context`
- `related_articles`
- `media_gallery`
- `source_provenance`
- `pattern_brief`

This keeps dashboard growth declarative and reviewable while still allowing the incident view to
expand as new information is collected.

## Spatial Context

The intelligence service now derives a `map_context` widget whenever an incident has an AOI or any
collected artifacts include latitude/longitude. That widget gives the tactical UI a safe,
structured way to:

- focus the globe on the incident context
- render bounded incident/intelligence markers without arbitrary frontend code
- distinguish between incident-level geometry and artifact-level geolocated media/articles
