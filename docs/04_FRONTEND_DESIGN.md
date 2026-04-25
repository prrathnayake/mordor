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
