import { validateCanonicalEvent } from "../../packages/contracts/src/index.js";
import { applyCanonicalEventToObjectState } from "../../packages/domain/src/index.js";
import { loadJsonFixture } from "../../packages/test-fixtures/src/index.js";

async function loadValidCanonicalEvent() {
  const fixture = await loadJsonFixture<unknown>(
    "contracts",
    "canonical-event.valid.position-observed.json",
  );
  const result = validateCanonicalEvent(fixture);

  if (result.ok) {
    return result.value;
  }

  throw new Error(result.issues.join(", "));
}

describe("applyCanonicalEventToObjectState", () => {
  it("projects position, velocity, and traceability from a canonical event", async () => {
    const event = await loadValidCanonicalEvent();
    const state = applyCanonicalEventToObjectState(null, event);

    expect(state.object_id).toBe("veh_42");
    expect(state.as_of).toBe(event.observed_at);
    expect(state.last_event_id).toBe(event.event_id);
    expect(state.position).toEqual({
      lat: -33.8688,
      lon: 151.2093,
      altitude_m: 0,
      geometry: {
        type: "Point",
        coordinates: [151.2093, -33.8688],
      },
    });
    expect(state.velocity).toEqual({
      speed_mps: 13.4,
      heading_deg: 91.2,
    });
    expect(state.attributes).toMatchObject({
      source_id: "src_campus_gps_1",
      event_type: "position_observed",
    });
  });

  it("ignores events older than the current materialized state", async () => {
    const baseEvent = await loadValidCanonicalEvent();
    const newerEvent = {
      ...baseEvent,
      event_id: "evt_newer",
      observed_at: "2026-04-05T10:15:40Z",
      payload: {
        ...baseEvent.payload,
        status: "stopped",
      },
    };
    const olderEvent = {
      ...baseEvent,
      event_id: "evt_older",
      observed_at: "2026-04-05T10:15:20Z",
    };

    const currentState = applyCanonicalEventToObjectState(null, newerEvent);
    const nextState = applyCanonicalEventToObjectState(currentState, olderEvent);

    expect(nextState).toEqual(currentState);
  });

  it("uses lexical event id ordering as a same-timestamp tie breaker", async () => {
    const baseEvent = await loadValidCanonicalEvent();
    const initialState = applyCanonicalEventToObjectState(null, {
      ...baseEvent,
      event_id: "evt_a",
      observed_at: "2026-04-05T10:15:30Z",
    });
    const replacementState = applyCanonicalEventToObjectState(initialState, {
      ...baseEvent,
      event_id: "evt_b",
      observed_at: "2026-04-05T10:15:30Z",
      payload: {
        ...baseEvent.payload,
        status: "idle",
      },
      speed_mps: 0,
    });

    expect(replacementState.last_event_id).toBe("evt_b");
    expect(replacementState.status).toBe("idle");
    expect(replacementState.velocity).toEqual({
      speed_mps: 0,
      heading_deg: 91.2,
    });
  });
});
