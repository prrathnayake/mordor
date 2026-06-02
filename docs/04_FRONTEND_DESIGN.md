# Frontend Design

## Frontend goals
The frontend must help an operator answer:
- what is happening now?
- what changed?
- what happened earlier?
- why did this alert fire?
- where did this object come from?
- what evidence supports this view?

## UX principles
- map-first
- timeline-aware
- evidence-driven
- fast to inspect
- low clutter
- explainable alerts
- resilient under partial live failure

## Main screens
### 1. Operations view
Primary live monitoring interface.

Contains:
- world scene
- layer panel
- realtime status strip
- object inspector
- alert drawer
- quick filters
- time mode switch (live vs replay)

### 2. Investigation view
Focused on time-window analysis.

Contains:
- timeline scrubber
- event list
- path playback
- correlated objects
- evidence panel
- export panel

### 3. Admin view
Contains:
- source health
- adapter logs
- ingestion lag
- configuration
- audit access

## Primary layout
### Left panel
- layer toggles
- source filters
- zone filters
- saved views

The left layer panel includes a Global Intel Sources layer for source discovery and
watch capability. Its globe markers open location-anchored popups that can show
embedded live video or source metadata without navigating away from the tactical
shell. Non-map sources, such as space weather or cyber advisories, remain visible in
the intelligence panel as catalog and alert context rather than misleading map pins.

### Center
- 2D/3D map or globe
- selected object highlights
- tracks
- zones
- events

### Right panel
- object inspector
- alert explanation
- source metadata
- event details

### Bottom panel
- timeline
- play/pause
- speed control
- step controls
- time window selector

## Rendering rules
### Live mode
- show current object positions
- update live objects and high-value overlays incrementally when fresh events arrive
- smooth movement visually but do not invent missing truth
- mark stale objects clearly
- show source health if live feed pauses
- show relative freshness at layer level so operators can see when each feed last refreshed
- reconnect scoped live subscriptions when the operator changes viewport enough that overlay
  relevance changes materially
- prefer differential overlay updates over full snapshot replacement once a viewport-scoped
  subscription has been established

### Replay mode
- render only from historical event stream
- display current replay timestamp clearly
- allow pause, step, and scrub
- preserve deterministic paths based on stored events

## Object inspector design
When an object is selected, show:
- object type
- object id
- display name
- current state
- source provenance
- recent events
- related alerts
- last seen timestamp
- confidence / quality metadata if available

## Alert panel design
For each alert show:
- title
- severity
- current status
- when opened
- linked objects
- linked evidence
- explanation
- acknowledgement history

## Visual state rules
### Healthy live data
Normal visual treatment.

### Stale object
Visual stale marker and last update age.

### Source degraded
Layer-level warning.

### Replay mode
Distinct visual indicator so operator never mistakes replay for live state.

## Performance rules
- viewport-based loading
- level-of-detail for dense objects
- clustering when appropriate
- virtualized side panels
- throttled redraws
- decoupled render vs control state when needed

## Accessibility
- keyboard controls for timeline
- readable panel structure
- color should not be the only signal
- tooltips for abbreviations
- motion-reduction option for playback

## Component architecture
Suggested structure:
- `AppShell`
- `MapScene`
- `TimelineBar`
- `LayerControlPanel`
- `ObjectInspector`
- `AlertDrawer`
- `SourceHealthStrip`
- `ReplayControls`
- `EventEvidencePanel`

## Dynamic UI Infrastructure

The tactical shell includes a dedicated dynamic UI layer for agent-driven and real-time component creation:

### UI Component Shop (`ui-component-shop.js`)
Centralized registry and factory for all dynamic UI surfaces:
- **Register** component types with factory functions, default configs, and z-index rules
- **Create / Mount** instances to DOM (static side rails, floating panels, or globe-tracked overlays)
- **Update** live data without re-creating DOM
- **Destroy** with cleanup (remove listeners, DOM nodes, Cesium postRender hooks)
- **Globe tracking** — auto-updates DOM position every frame via Cesium `postRender`
- **Visibility** — hides components when anchor moves off-screen or behind globe

### Space Calculator (`space-calculator.js`)
Coordinate conversion engine supporting multiple input formats:
| Format | Example |
|--------|---------|
| Lat/Lon/Height | `{ lat: 35.68, lon: 51.38, height: 100 }` |
| Cartesian3 | `Cesium.Cartesian3` instance |
| Cartographic | `Cesium.Cartographic` radians |
| Screen pixels | `{ x: 500, y: 300 }` |
| MGRS | `"14RPU1234567890"` |
| UTM | `{ zone: 14, easting: 123456, northing: 7890123 }` |
| Address | `"Tehran, Iran"` (cached Nominatim geocoding) |
| Entity-relative | `{ entityId: "flight-123", offset: { x: 0, y: 0, z: 50 } }` |

Utilities: `toCartesian3()`, `toScreen()`, `toLatLon()`, `isVisible()`, `distanceMeters()`, `bearingDegrees()`, `getViewportBounds()`.

### UI Event Bus (`ui-event-bus.js`)
Pub/sub event bus for inter-component and agent-to-UI communication:
- **Subscribe:** `on(event, handler)`, `once(event, handler)`, wildcard `on("*", handler)`
- **Publish:** `emit(event, data, meta)` with automatic history tracking
- **Middleware:** chainable validation/transformation hooks
- **Rate limiting:** per-listener debounce and throttle options
- **Async:** `waitFor(event, timeout)` returns Promise
- **History:** queryable event log for replay and debugging

Pre-wired events:
| Event | Trigger | Effect |
|-------|---------|--------|
| `incident_selected` | Operator clicks incident | Creates `globe-popup` + `timeline` at incident location |
| `external_layer_update` | SSE layer refresh | Updates `badge` count for the affected layer |
| `alert_fired` | New alert generated | Creates `alert-toast` + optional `globe-popup` |
| `agent_create_ui` | External agent broadcast | Validates template + data, creates component via Template system |

### Component Templates (`ui-component-templates.js`)
Schema-driven, agent-safe component creation without raw HTML injection:
- **Builtin templates:** `incident-card`, `flight-tracker`, `breaking-alert`, `intelligence-summary`, `event-timeline`, `source-panel`
- **Validation:** required fields, type checking, enum constraints, custom validators
- **Sanitization:** all strings HTML-escaped unless explicitly marked `allowHtml`
- **Agent API:**
  ```js
  window.createAgentUI("incident-card", { id: "...", title: "...", severity: "critical", position: { lat: 35.68, lon: 51.38 } });
  window.uiTemplates.listTemplates();   // Available templates
  window.uiTemplates.getSchema(name);    // JSON schema for a template
  ```

### Smart Layout Engine (`ui-layout-engine.js`)
Prevents component overlap and intelligently positions elements:
| Strategy | Best For | Behavior |
|----------|----------|----------|
| `spiralAvoid` | General popups | Spiral offset from desired position, avoids collisions |
| `gridPlace` | Panels | Grid-based placement with configurable cols/cell size |
| `stackPlace` | Toasts/alerts | Vertical stack with direction (up/down) |
| `clusterGlobe` | Globe badges/popups | Groups nearby components into clusters with radial offset |

- **Collision detection:** screen-pixel rectangle intersection with configurable margin
- **Globe clustering:** distance-based grouping (default 50km) with automatic radial spread
- **Viewport clamping:** keeps all components on-screen
- **Usage:** `window.getUILayoutPosition("globe-popup", { lat: 35.68, lon: 51.38 }, { strategy: "clusterGlobe" })`

### Agent Global Helpers
Exposed on `window` for external agent scripts:
```js
window.createAgentUI(templateName, data)         // Create from template
window.emitUIEvent(event, data)                  // Publish to event bus
window.getUILayoutPosition(type, pos, opts)     // Get smart position
```

## Frontend state model
Separate these concerns:
1. view state
2. query/filter state
3. live subscription state
4. replay state
5. selected entity state
6. server cache state

Do not mix them all into one uncontrolled global store.

## Error handling UX
- partial layer failures should not blank the whole scene
- show source-level errors in health panel
- stale replay data should be explicit
- API loading and websocket reconnect states should be visible
- media and source catalog failures should degrade to a local demo catalog so the
  operator can still test popups, embeds, and source metadata while offline

## Frontend non-negotiables
1. Live and replay must be visibly distinct.
2. Inspector must always expose provenance.
3. Alerts must always expose evidence.
4. Client must support full reload and state rehydration.
5. UI animations must never alter the authoritative event truth.

## Swan frontend integration
Swan is integrated into the existing tactical shell rather than a separate workspace. The browser client keeps the feature lightweight by:
- offering an explicit Swan toggle and compact status chip in the header
- emitting only debounced semantic activity events, never raw pointer streams or keystroke telemetry
- attaching route, mode, selection, and active-layer context to each Swan event
- hydrating `session`, `panels`, `map`, and `notifications` artifacts through the API
- subscribing to Swan updates through the shared `/live/events` stream

UI enrichment rules:
- panel findings are appended to existing object, alert, and incident detail views
- only `cross_checked` and `trusted_source` findings may surface as notifications or map overlays
- replay mode may still receive Swan enrichment updates, but live object-state rendering remains scoped to live mode only
- reload must rehydrate the current Swan projections from artifact endpoints before waiting for new stream events

## Incident intelligence widgets
Incident intelligence is rendered inside the existing incident panel rather than by injecting new
free-form DOM roots. The current UI rules are:

- the client reads widget manifests from `GET /incidents/:id/intelligence`
- the incident panel renders only known widget types such as summary, map context, related
  articles, media gallery, provenance, and pattern brief
- live `incident_intelligence_update` events should refresh only the currently open incident
- manual refresh is an explicit authenticated action through the incident panel
- internet-derived titles, summaries, and links must be escaped or rendered from structured fields only
- map-context widgets may place scoped incident-intelligence markers on the globe, but those
  markers must come from structured widget specs and cleaned geometry helpers rather than raw
  generated HTML
