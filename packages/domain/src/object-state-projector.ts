import type {
  CanonicalEvent,
  Geometry,
  ObjectState,
  PositionSnapshot,
  VelocitySnapshot,
} from "../../contracts/src/models.js";
import { OBJECT_STATE_SCHEMA_VERSION } from "../../contracts/src/versions.js";

function compareEventFreshness(candidate: CanonicalEvent, currentState: ObjectState): number {
  const candidateTimestamp = Date.parse(candidate.observed_at);
  const currentTimestamp = Date.parse(currentState.as_of);

  if (candidateTimestamp !== currentTimestamp) {
    return candidateTimestamp - currentTimestamp;
  }

  return candidate.event_id.localeCompare(currentState.last_event_id);
}

function extractPosition(event: CanonicalEvent): PositionSnapshot | null {
  const geometry = event.geometry;
  const payloadLat = typeof event.payload.lat === "number" ? event.payload.lat : undefined;
  const payloadLon = typeof event.payload.lon === "number" ? event.payload.lon : undefined;

  if (geometry?.type === "Point") {
    const [lon, lat, altitude] = geometry.coordinates;

    return {
      lat,
      lon,
      altitude_m: event.altitude_m ?? altitude ?? null,
      geometry,
    };
  }

  if (payloadLat !== undefined && payloadLon !== undefined) {
    const derivedGeometry: Geometry = {
      type: "Point",
      coordinates: [payloadLon, payloadLat],
    };

    return {
      lat: payloadLat,
      lon: payloadLon,
      altitude_m: event.altitude_m ?? null,
      geometry: derivedGeometry,
    };
  }

  return null;
}

function extractVelocity(event: CanonicalEvent): VelocitySnapshot | null {
  const speedMps =
    event.speed_mps ??
    (typeof event.payload.speed_mps === "number" ? event.payload.speed_mps : null);
  const headingDeg =
    event.heading_deg ??
    (typeof event.payload.heading_deg === "number" ? event.payload.heading_deg : null);

  if (speedMps === null && headingDeg === null) {
    return null;
  }

  return {
    speed_mps: speedMps,
    heading_deg: headingDeg,
  };
}

function deriveStatus(event: CanonicalEvent, priorState: ObjectState | null): string | null {
  if (typeof event.payload.status === "string" && event.payload.status.trim() !== "") {
    return event.payload.status;
  }

  return priorState?.status ?? event.event_type;
}

export function applyCanonicalEventToObjectState(
  currentState: ObjectState | null,
  event: CanonicalEvent,
): ObjectState {
  if (currentState && compareEventFreshness(event, currentState) < 0) {
    return currentState;
  }

  return {
    object_id: event.object_id,
    state_version: OBJECT_STATE_SCHEMA_VERSION,
    as_of: event.observed_at,
    position: extractPosition(event),
    velocity: extractVelocity(event),
    status: deriveStatus(event, currentState),
    attributes: {
      ...(currentState?.attributes ?? {}),
      confidence: event.confidence,
      event_type: event.event_type,
      source_id: event.source_id,
      trace_id: event.trace_id ?? null,
    },
    last_event_id: event.event_id,
  };
}
