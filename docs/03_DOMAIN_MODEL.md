# Domain Model

## Purpose
This file defines the canonical model. Every source adapter must map into this model.

## Core principle
The platform stores **events**, not just objects.

Objects represent entities in the world.  
Events represent changes or observations about those entities over time.

## Primary entities
### 1. Source
Represents an external feed or internal producer.

Fields:
- `source_id`
- `source_type`
- `name`
- `status`
- `owner`
- `auth_ref`
- `polling_mode`
- `schema_version`
- `created_at`
- `updated_at`

### 2. TrackedObject
Represents a real-world or virtual entity.

Examples:
- vehicle
- vessel
- aircraft
- satellite
- camera
- gate
- sensor
- person proxy
- zone
- alert entity

Fields:
- `object_id`
- `object_type`
- `display_name`
- `source_primary`
- `latest_state_ref`
- `created_at`
- `updated_at`
- `tags`

### 3. CanonicalEvent
This is the most important entity.

Required fields:
- `event_id`
- `event_type`
- `object_id`
- `source_id`
- `observed_at`
- `ingested_at`
- `schema_version`
- `payload`
- `provenance`
- `confidence`
- `dedupe_key`

Optional geospatial fields:
- `geometry`
- `altitude_m`
- `heading_deg`
- `speed_mps`

Optional link fields:
- `related_object_ids`
- `parent_event_id`
- `trace_id`

### 4. ObjectState
Materialized latest known state for fast querying.

Fields:
- `object_id`
- `state_version`
- `as_of`
- `position`
- `velocity`
- `status`
- `attributes`
- `last_event_id`

### 5. Alert
Represents a triggered condition.

Fields:
- `alert_id`
- `rule_id`
- `severity`
- `status`
- `opened_at`
- `updated_at`
- `closed_at`
- `evidence_event_ids`
- `evidence_object_ids`
- `summary`
- `explanation`
- `confidence`

### 6. Zone
Represents named spatial areas.

Fields:
- `zone_id`
- `name`
- `zone_type`
- `geometry`
- `policy_tags`

## Event taxonomy
Start with a limited event taxonomy.

### Observation events
- `position_observed`
- `state_observed`
- `camera_observed`
- `sensor_observed`

### Control / system events
- `source_connected`
- `source_disconnected`
- `source_error`
- `normalization_failed`

### Derived events
- `zone_entered`
- `zone_exited`
- `route_deviation_detected`
- `alert_opened`
- `alert_closed`

## Time semantics
Every event must preserve:
- `observed_at`: when the source says it happened
- `ingested_at`: when we received it
- `processed_at`: when we derived downstream effects

Never collapse these into one field.

## Provenance rules
Each event must retain:
- source identity
- raw source reference
- adapter version
- transformation notes
- confidence / trust notes

This is mandatory for investigation and compliance.

## Dedupe rules
Dedupe is allowed only at the normalization layer using explicit logic.
Dedupe must not destroy history silently.

Required approach:
- keep raw payload references
- calculate deterministic dedupe keys
- log dedupe decisions
- allow operator inspection of suppressed duplicates if needed

## Latest state rules
Latest state is a materialization only.
It must be rebuildable from canonical events.

## Spatial model
Support these geometries:
- point
- line string
- polygon

Common uses:
- object positions = point
- tracks / routes = line string
- zones / geofences = polygon

## Replay model
Replay is built by ordering canonical events by:
1. effective replay timestamp
2. tie-breaker rules
3. deterministic event id ordering

Tie-breaker rules must be documented in code and tested.

## Schema versioning
Every canonical event carries a schema version.
Schema changes require:
- migration notes
- compatibility strategy
- fixture updates
- replay verification

## Canonical event JSON contract
```json
{
  "event_id": "evt_123",
  "event_type": "position_observed",
  "object_id": "veh_42",
  "source_id": "src_gps_1",
  "observed_at": "2026-04-05T10:15:30Z",
  "ingested_at": "2026-04-05T10:15:32Z",
  "schema_version": "1.0.0",
  "payload": {
    "lat": -33.8688,
    "lon": 151.2093,
    "altitude_m": 0,
    "heading_deg": 91.2,
    "speed_mps": 13.4
  },
  "provenance": {
    "adapter": "gps_adapter_v1",
    "raw_ref": "raw_abc123"
  },
  "confidence": 0.98,
  "dedupe_key": "src_gps_1:veh_42:2026-04-05T10:15:30Z"
}
```

## Domain invariants
1. No canonical event without provenance.
2. No object state update without source event linkage.
3. No alert without evidence.
4. No replay based on latest state alone.
5. No source-specific payload leaking into core APIs without normalization.
