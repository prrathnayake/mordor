# Phase 16: Incident Playback and Correlation Timeline

## Status: In Progress

## Date: 2026-04-06

## Summary
Turn MORDOR from a layer viewer into a true multi-layer incident reconstruction system by adding named incident playback, multi-layer correlation timeline, chapter/event markers, and synchronized before/during/after replay across layers.

## Critical Requirements
- Named incidents with explicit references to alerts and events
- Multi-layer correlation timeline with ribbon markers
- Incident playback mode with chapter jumps
- Globe focus integration during incident replay
- Preserve all existing workflows

## Implementation Plan

### 1. Incident Model
**File**: `packages/contracts/src/models.ts`

```typescript
interface Incident {
  incident_id: string;
  title: string;
  description: string;
  start_at: string;       // ISO timestamp
  end_at: string;         // ISO timestamp
  aoi?: Geometry;          // Area of Interest polygon
  status: "open" | "investigating" | "resolved" | "closed";
  severity: "low" | "medium" | "high" | "critical";
  created_at: string;
  updated_at: string;
  created_by: string;
  tags: string[];
}

interface IncidentChapter {
  chapter_id: string;
  incident_id: string;
  title: string;
  timestamp: string;
  description?: string;
  event_ids: string[];
  alert_ids: string[];
  position?: PositionSnapshot;
}

interface IncidentLink {
  incident_id: string;
  event_id?: string;
  alert_id?: string;
  external_event_id?: string;
  layer_id?: string;
  linked_at: string;
  linked_by: string;
}
```

### 2. API Endpoints
- `GET /incidents` - List incidents
- `GET /incidents/:id` - Get incident detail
- `GET /incidents/:id/timeline` - Get correlated timeline data
- `POST /incidents` - Create incident
- `PATCH /incidents/:id` - Update incident
- `POST /incidents/:id/chapters` - Add chapter marker
- `POST /incidents/:id/links` - Link event/alert to incident

### 3. Timeline UI
**Bottom ribbon with markers for**:
- Alert markers (red triangles)
- Earthquake markers (magnitude-colored circles)
- Weather alert markers (severity-colored)
- Source health events (gray diamonds)
- Chapter markers (vertical lines with labels)
- External data layer events (per-layer colors)

### 4. Incident Playback Controls
- Before / During / After sections
- Play / Pause / Scrub
- Speed presets (0.5x, 1x, 2x, 5x, 10x)
- Chapter jump buttons
- Incident timeline scrubbing

### 5. Globe Focus Integration
- Camera focuses AOI when incident opens
- Auto-selects relevant objects during playback
- Links to existing object selection and investigation

## Database Schema

### Incidents Table
```sql
CREATE TABLE incidents (
  incident_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  aoi geometry(Polygon, 4326),
  status TEXT NOT NULL CHECK (status IN ('open', 'investigating', 'resolved', 'closed')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}'
);
```

### Incident Chapters Table
```sql
CREATE TABLE incident_chapters (
  chapter_id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  description TEXT,
  event_ids TEXT[] NOT NULL DEFAULT '{}',
  alert_ids TEXT[] NOT NULL DEFAULT '{}',
  position geography(Point, 4326),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Incident Links Table
```sql
CREATE TABLE incident_links (
  incident_id TEXT NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
  event_id TEXT,
  alert_id TEXT,
  external_event_id TEXT,
  layer_id TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  linked_by TEXT NOT NULL,
  PRIMARY KEY (incident_id, event_id, alert_id, external_event_id)
);
```

## Layer Timeline Events

| Layer | Marker Type | Color |
|-------|-------------|-------|
| Alerts | Triangle | Red (severity) |
| Earthquakes | Circle | Magnitude-based |
| Satellites | Square | Type-based |
| Weather | Diamond | Severity-based |
| Traffic | Hexagon | Severity-based |
| Bikeshare | Circle | Availability |
| Source Health | Small square | Status-based |
| Chapters | Vertical line | White |

## Files to Create/Modify

### New Files
- `packages/contracts/src/incident-models.ts` - Incident type definitions
- `infra/migrations/0003_incidents.sql` - Incident database schema
- `packages/persistence/src/incident-persistence.ts` - Incident persistence
- `apps/api/src/incidents-api.ts` - Incident API endpoints
- `apps/web/public/incident-ui.js` - Incident UI logic
- `tests/unit/incident-model.spec.ts` - Unit tests
- `tests/integration/incident-api.spec.ts` - Integration tests
- `tests/e2e/incident-playback.spec.ts` - E2E tests

### Modified Files
- `packages/contracts/src/models.ts` - Add incident types export
- `packages/persistence/src/postgres-persistence.ts` - Add incident methods
- `apps/api/src/server.ts` - Add incident endpoints
- `apps/web/public/app.js` - Add incident mode and timeline
- `apps/web/public/index.html` - Add incident panel markup
- `apps/web/public/tactical-styles.css` - Timeline styles

## Definition of Done
- [x] Incidents can be defined and opened
- [x] Timeline shows correlated multi-layer markers
- [x] Incident playback works end to end
- [ ] Alerts/events participate in incident reconstruction
- [x] Tests and hard gates pass

## Phase 16 Implementation Completed

### Backend (API + Persistence)

**Incident Model Types** (`packages/contracts/src/incident-models.ts`):
- `Incident`, `IncidentChapter`, `IncidentLink`, `TimelineMarker`
- `IncidentTimeline`, `IncidentPlaybackState`
- Request/response types for CRUD operations

**Database Schema** (`infra/migrations/0003_incidents.sql`):
- `incidents` table with severity, status, tags, AOI geometry
- `incident_chapters` table for chapter markers
- `incident_links` table for linking alerts/events to incidents

**API Endpoints** (`apps/api/src/server.ts`):
- `GET /incidents` - List incidents
- `POST /incidents` - Create incident
- `GET /incidents/:id` - Get incident detail
- `PATCH /incidents/:id` - Update incident
- `GET /incidents/:id/timeline` - Get correlated timeline data
- `GET /incidents/:id/chapters` - Get chapters
- `POST /incidents/:id/chapters` - Add chapter marker
- `GET /incidents/:id/links` - Get links
- `POST /incidents/:id/links` - Link event/alert

**Persistence** (`packages/persistence/src/postgres-persistence.ts`):
- `fetchIncidents`, `fetchIncident`, `createIncident`, `updateIncident`
- `fetchIncidentChapters`, `createIncidentChapter`
- `fetchIncidentLinks`, `createIncidentLink`
- `fetchIncidentTimeline` - Correlates all layer events within incident time range

### Frontend (Web UI)

**HTML Markup** (`apps/web/public/index.html`):
- Incident panel with title, severity, status
- Before/During/After section buttons
- Chapter markers list
- Playback controls (play/pause, scrubber, speed selector)
- Incident list modal with create form

**CSS Styles** (`apps/web/public/tactical-styles.css`):
- Incident panel styles with severity/status colors
- Section button states (before/during/after)
- Chapter marker styling
- Playback controls styling
- Correlation timeline styles with marker types

**JavaScript Logic** (`apps/web/public/app.js`):

State Management:
- `incidentState` object with current incident, timeline, chapters, markers, entities
- Playback state with isPlaying, speed, currentTime, section

API Functions:
- `loadIncidents()` - Fetch incident list
- `loadIncidentTimeline(incidentId)` - Get correlated timeline
- `loadIncidentChapters(incidentId)` - Get chapters
- `openIncident(incidentId)` - Load and display incident
- `createIncident()` - Create new incident

UI Functions:
- `showIncidentModal()` / `hideIncidentModal()` - Toggle incident list
- `showNewIncidentForm()` / `hideNewIncidentForm()` - Toggle create form
- `renderIncidentList()` - Display incidents in modal
- `renderIncidentPanel()` - Display incident details
- `updateSectionCounts()` - Update before/during/after counts
- `renderChapters()` - Display chapter markers
- `setIncidentSection(section)` - Switch between sections

Playback Functions:
- `playIncident()` - Start playback
- `pauseIncident()` - Pause playback
- `stopIncidentPlayback()` - Stop and reset
- `setIncidentSpeed(speed)` - Change playback speed
- `jumpToIncidentTime(timestamp)` - Jump to specific time
- `updateIncidentScrubber()` - Update scrubber position
- `updateIncidentView()` - Highlight markers at current time
- `highlightMarkersAtTime(timestamp)` - Show/hide markers

Timeline Rendering:
- `renderCorrelationTimeline()` - Draw markers on map
- `getMarkerSize(type)` - Get marker size by type
- `getMarkerColor(marker)` - Get marker color based on severity/type
- `getMarkerLabel(marker)` - Get label text for marker

Globe Focus:
- `focusOnAOI(aoi)` - Fly camera to incident AOI

Event Listeners:
- Incident panel close button
- Section buttons (before/during/after)
- Play/pause buttons
- Scrubber input
- Speed selector
- Incident modal events
- New incident form events

### Validation Results

**TypeScript**: Passes
**Biome Lint**: Passes (0 errors)
**Unit Tests**: Pass (multiple test files verified)
