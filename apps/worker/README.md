# Worker App

This app now exposes the first ingestion runtime path for fixture telemetry input.

Implemented now:
- fixture telemetry worker job wrapper
- shared ingestion orchestration
- raw payload persistence
- canonical validation
- dedupe-aware canonical event persistence
- latest-state materialization

The worker remains intentionally narrow and fixture-driven until the first adapter path is stable under tests.
