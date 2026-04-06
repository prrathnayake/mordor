import type { CanonicalEvent } from "../../contracts/src/models.js";

const OBSERVATION_EVENT_TYPES = new Set([
  "position_observed",
  "state_observed",
  "camera_observed",
  "sensor_observed",
]);

const CONTROL_EVENT_TYPES = new Set([
  "source_connected",
  "source_disconnected",
  "source_error",
  "normalization_failed",
]);

const DERIVED_EVIDENCE_EVENT_TYPES = new Set([
  "zone_entered",
  "zone_exited",
  "route_deviation_detected",
]);

const ALERT_LIFECYCLE_EVENT_TYPES = new Set(["alert_opened", "alert_closed"]);

function getReplayEffectiveTime(event: CanonicalEvent): number {
  return Date.parse(event.observed_at || event.ingested_at);
}

function getReplayCategoryPriority(event: CanonicalEvent): number {
  if (OBSERVATION_EVENT_TYPES.has(event.event_type)) {
    return 0;
  }

  if (CONTROL_EVENT_TYPES.has(event.event_type)) {
    return 1;
  }

  if (DERIVED_EVIDENCE_EVENT_TYPES.has(event.event_type)) {
    return 2;
  }

  if (ALERT_LIFECYCLE_EVENT_TYPES.has(event.event_type)) {
    return 3;
  }

  return 4;
}

export function compareCanonicalEventsForReplay(a: CanonicalEvent, b: CanonicalEvent): number {
  const effectiveTimeDiff = getReplayEffectiveTime(a) - getReplayEffectiveTime(b);

  if (effectiveTimeDiff !== 0) {
    return effectiveTimeDiff;
  }

  const priorityDiff = getReplayCategoryPriority(a) - getReplayCategoryPriority(b);

  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return a.event_id.localeCompare(b.event_id);
}

export function orderEventsForReplay(events: readonly CanonicalEvent[]): CanonicalEvent[] {
  return [...events].sort(compareCanonicalEventsForReplay);
}
