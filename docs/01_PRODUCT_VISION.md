# Product Vision

## Project name
Working name: **Chrona Twin**  
Alternative internal label: **Live Geo Temporal Twin Platform**

## Vision
Build a browser-based platform that creates a **living, time-aware digital twin** of a real environment by combining:
- a geospatial world model
- live telemetry and sensor feeds
- event history
- replay and investigation tools
- AI-assisted summarization and anomaly surfacing

## Problem
Teams often have:
- separate live dashboards
- disconnected cameras
- isolated telemetry systems
- poor replay capability
- no unified timeline
- weak auditability
- no single operational truth

This project solves that by creating one system where operators can:
- see what is happening now
- see what happened before
- inspect why it happened
- correlate across sources
- receive explainable alerts

## Primary users
1. **Operator**
   Watches live movement, filters layers, inspects objects, and handles alerts.

2. **Analyst / investigator**
   Replays incidents, correlates timelines, and exports findings.

3. **Administrator**
   Manages sources, access, policies, and health.

4. **Developer / integrator**
   Adds sources, adapters, analytics logic, and workflows.

## MVP scope
The MVP must support:
- one primary domain
- one world scene
- two live source types
- canonical event normalization
- persistent event storage
- realtime streaming
- time-range replay
- object inspection
- layer toggles
- basic alert rules
- audit logs
- strict testing

## Non-goals for MVP
Do not include these in MVP:
- full physics simulation
- global scale ingestion
- autonomous decision-making
- complex generative AI control loops
- multi-tenant enterprise billing
- advanced video analytics pipelines
- custom rendering engine
- edge deployment mesh
- full mobile application

## Target qualities
- deterministic event handling
- clear contracts
- strong traceability
- replay correctness
- stable user experience
- incremental extensibility
- safe AI usage boundaries
- secure source governance

## Core product capabilities
### 1. Live monitoring
Operators see moving and changing objects in a world view.

### 2. Historical replay
Users scrub time and replay object movement and state changes.

### 3. Correlation
Multiple feeds align on one clock and one spatial model.

### 4. Explainable alerting
Every alert shows:
- source events
- rule version
- correlated entities
- timestamps
- confidence or certainty notes

### 5. Investigation support
An analyst can reconstruct sequences over a selected time window.

## Example MVP scenario
For a campus or industrial yard:
- GPS trackers publish vehicle positions
- selected cameras publish metadata or operator annotations
- gates publish entry events
- the map shows live movement
- an operator selects a vehicle and sees its timeline
- the system replays the past 30 minutes
- a rule flags a vehicle entering a restricted zone after hours
- the platform explains which events triggered the alert

## Product constraints
- must be web-first
- must remain understandable by developers
- must support replay from day one
- must never rely only on transient live state
- must be safe to extend source by source
- must be testable in CI with simulated feeds

## Success metrics
MVP is successful when:
- ingest latency for basic sources is acceptable and observable
- replay reproduces expected trajectories from stored events
- alert causes are inspectable
- frontend remains responsive with test load
- new data source adapters can be added without changing core contracts
- hard compliance tests pass on every protected branch

## Release criteria
Release only when:
- canonical event contract is stable
- schema migrations are versioned
- replay engine is deterministic under test fixtures
- ingest failures are isolated
- access control is enforced
- audit trail is queryable
- test gates are green
