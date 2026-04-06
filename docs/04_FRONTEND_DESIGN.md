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
- smooth movement visually but do not invent missing truth
- mark stale objects clearly
- show source health if live feed pauses

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

## Frontend non-negotiables
1. Live and replay must be visibly distinct.
2. Inspector must always expose provenance.
3. Alerts must always expose evidence.
4. Client must support full reload and state rehydration.
5. UI animations must never alter the authoritative event truth.
