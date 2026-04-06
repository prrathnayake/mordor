# Replay, Timeline, and Analytics

## Goal
Allow users to reconstruct the past with confidence and understand system-derived insights without mixing them up with raw truth.

## Replay principles
- replay is based on durable event history
- replay must be deterministic
- replay timestamp must be explicit
- derived insights must remain distinguishable from source observations
- users must know whether they are seeing live or replay

## Replay modes
### Live-follow mode
Continuously consumes new events.

### Window replay mode
User selects:
- start time
- end time
- objects / zones / filters
- playback speed

### Step mode
Advance event by event or time slice by time slice.

## Replay engine requirements
- stable ordering
- pagination or chunk streaming
- time cursor support
- efficient filtering by object, zone, event type
- deterministic serialization

## Ordering policy
Define one replay effective time:
- default = `observed_at`
- fall back to `ingested_at` when observation time is unavailable and policy permits

Tie-break order:
1. effective replay time
2. priority by event category if needed
3. event id lexical order or internal monotonic surrogate

This must be coded once and tested thoroughly.

## Track reconstruction
For moving objects:
- reconstruct path from position events
- support interpolation only as a visual option
- never store interpolation as source truth
- mark estimated segments differently

## Analytics boundaries
Analytics can:
- correlate events
- create derived events
- open alerts
- generate summaries
- compute metrics

Analytics cannot:
- overwrite raw source truth
- erase provenance
- mutate canonical history destructively

## MVP analytics
Start with deterministic analytics:
- entered restricted zone
- exited zone
- object stale / not reporting
- after-hours presence
- route deviation from expected corridor
- source outage

## AI use boundaries
AI may be used for:
- operator summaries
- incident summaries
- human-readable alert explanations
- ranking noisy alerts
- natural language investigation helper

AI may not be used as the only source of operational truth in MVP.

## Evidence chain
Every analytic output must link to:
- source event ids
- related object ids
- rule or model version
- timestamps used
- confidence or caveat notes

## Export requirements
Users should be able to export:
- time window
- selected objects
- alert bundle
- evidence event list

## Replay correctness tests
Replay tests must verify:
- stable ordering
- repeated runs produce same sequence
- missing source intervals do not fabricate truth
- delayed arrival events are represented correctly under documented policy
- replay of fixture incidents matches expected snapshots

## Visualization rules for analytics
- source observations and derived insights use distinct visual encodings
- evidence inspection available from alert or object timeline
- estimated or inferred state must be clearly marked

## Non-negotiables
1. Replay must be reproducible.
2. Derived analytics must be auditable.
3. AI explanations must never masquerade as raw evidence.
4. Timeline semantics must be obvious in API and UI.
