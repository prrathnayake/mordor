import { describe, expect, it } from "vitest";
import { type LiveEvent, liveEventBus } from "../../apps/api/src/live-event-bus.js";

describe("live event bus", () => {
  it("subscribes and receives published events", () => {
    const receivedEvents: LiveEvent[] = [];

    const unsubscribe = liveEventBus.subscribe((event) => {
      receivedEvents.push(event);
    });

    liveEventBus.publish({
      type: "object_state_update",
      timestamp: "2026-04-05T10:20:00Z",
      payload: { object_id: "test" },
    });

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].type).toBe("object_state_update");

    unsubscribe();
  });

  it("unsubscribes and stops receiving events", () => {
    const receivedEvents: LiveEvent[] = [];

    const unsubscribe = liveEventBus.subscribe((event) => {
      receivedEvents.push(event);
    });

    liveEventBus.publish({
      type: "object_state_update",
      timestamp: "2026-04-05T10:20:00Z",
      payload: { object_id: "test1" },
    });

    unsubscribe();

    liveEventBus.publish({
      type: "object_state_update",
      timestamp: "2026-04-05T10:20:01Z",
      payload: { object_id: "test2" },
    });

    expect(receivedEvents.length).toBe(1);
  });

  it("handles multiple subscribers", () => {
    const receivedEvents1: LiveEvent[] = [];
    const receivedEvents2: LiveEvent[] = [];

    const unsub1 = liveEventBus.subscribe((event) => receivedEvents1.push(event));
    const unsub2 = liveEventBus.subscribe((event) => receivedEvents2.push(event));

    liveEventBus.publish({
      type: "object_state_update",
      timestamp: "2026-04-05T10:20:00Z",
      payload: { object_id: "test" },
    });

    expect(receivedEvents1.length).toBe(1);
    expect(receivedEvents2.length).toBe(1);

    unsub1();
    unsub2();
  });

  it("publishes source health updates", () => {
    const receivedEvents: LiveEvent[] = [];

    liveEventBus.subscribe((event) => {
      receivedEvents.push(event);
    });

    liveEventBus.publish({
      type: "source_health_update",
      timestamp: "2026-04-05T10:20:00Z",
      payload: {
        source_id: "test_source",
        status: "active",
        last_seen_at: "2026-04-05T10:20:00Z",
        error_message: null,
      },
    });

    expect(receivedEvents.length).toBe(1);
    expect(receivedEvents[0].type).toBe("source_health_update");
    expect((receivedEvents[0].payload as { status: string }).status).toBe("active");
  });
});
