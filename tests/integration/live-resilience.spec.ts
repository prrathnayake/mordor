import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startApiServer } from "../../apps/api/src/index.js";
import { type LiveEvent, liveEventBus } from "../../apps/api/src/live-event-bus.js";
import { startPostgresTestEnvironment } from "../helpers/postgres-test-environment.js";

let api: Awaited<ReturnType<typeof startApiServer>>;
let environment: Awaited<ReturnType<typeof startPostgresTestEnvironment>>;

describe("live event bus resilience", () => {
  beforeAll(async () => {
    environment = await startPostgresTestEnvironment();
    api = await startApiServer({
      connection_string: environment.connection_string,
      skipConfigValidation: true,
    });
  }, 60000);

  afterAll(async () => {
    await api.close();
    await environment.stop();
  }, 60000);

  beforeEach(async () => {
    await environment.database.pool.query("DELETE FROM canonical_events");
    await environment.database.pool.query("DELETE FROM latest_object_states");
    await environment.database.pool.query("DELETE FROM tracked_objects");
    await environment.database.pool.query("DELETE FROM sources");
  });

  it("tracks sequence numbers for events", () => {
    const initialSequence = liveEventBus.getSequence();

    liveEventBus.publish({
      type: "object_state_update",
      timestamp: new Date().toISOString(),
      payload: { object_id: "obj_1" },
    } as LiveEvent);

    expect(liveEventBus.getSequence()).toBe(initialSequence + 1);
  });

  it("stores recent events for backfill", () => {
    liveEventBus.publish({
      type: "object_state_update",
      timestamp: new Date().toISOString(),
      payload: { object_id: "obj_backfill" },
    } as LiveEvent);

    const seq = liveEventBus.getSequence();
    const recent = liveEventBus.getRecentEvents(seq - 1);

    expect(recent.length).toBeGreaterThan(0);
  });

  it("retrieves events after a given sequence", () => {
    const beforeSeq = liveEventBus.getSequence();

    liveEventBus.publish({
      type: "object_state_update",
      timestamp: new Date().toISOString(),
      payload: { object_id: "obj_after" },
    } as LiveEvent);

    const afterSeq = liveEventBus.getSequence();
    const missed = liveEventBus.getRecentEvents(beforeSeq);

    expect(missed.length).toBeGreaterThan(0);
    expect(afterSeq).toBe(beforeSeq + 1);
  });

  it("provides connection info with sequence", () => {
    const info = liveEventBus.getConnectionInfo();

    expect(info.type).toBe("connection_info");
    expect(info.payload.server_sequence).toBeDefined();
    expect(info.payload.server_time).toBeDefined();
  });

  it("handles multiple publishes with increasing sequence", () => {
    const startSeq = liveEventBus.getSequence();

    for (let i = 0; i < 5; i++) {
      liveEventBus.publish({
        type: "object_state_update",
        timestamp: new Date().toISOString(),
        payload: { object_id: `obj_${i}` },
      } as LiveEvent);
    }

    const endSeq = liveEventBus.getSequence();
    expect(endSeq).toBe(startSeq + 5);
  });

  it("returns empty array when no events since sequence", () => {
    const currentSeq = liveEventBus.getSequence();
    const events = liveEventBus.getRecentEvents(currentSeq);

    expect(events).toHaveLength(0);
  });
});

describe("live reconnect behavior", () => {
  beforeAll(async () => {
    environment = await startPostgresTestEnvironment();
    api = await startApiServer({
      connection_string: environment.connection_string,
      skipConfigValidation: true,
    });
  }, 60000);

  afterAll(async () => {
    await api.close();
    await environment.stop();
  }, 60000);

  it("accepts since_sequence parameter", async () => {
    const controller = new AbortController();
    const response = await fetch(`http://127.0.0.1:${api.port}/live/events?since_sequence=0`, {
      signal: controller.signal,
    });

    controller.abort();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
  });

  it("sends connection info on connect", async () => {
    const controller = new AbortController();
    const response = await fetch(`http://127.0.0.1:${api.port}/live/events`, {
      signal: controller.signal,
    });

    expect(response.status).toBe(200);

    const reader = response.body?.getReader();
    if (!reader) {
      controller.abort();
      return;
    }

    const decoder = new TextDecoder();
    let done = false;
    let foundConnectionInfo = false;

    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;

      if (value) {
        const text = decoder.decode(value);
        if (text.includes("connection_info")) {
          foundConnectionInfo = true;
          break;
        }
      }
    }

    controller.abort();
    expect(foundConnectionInfo).toBe(true);
  });

  it("provides backfill for missed events", async () => {
    liveEventBus.publish({
      type: "object_state_update",
      timestamp: new Date().toISOString(),
      payload: { object_id: "obj_backfill_test" },
    } as LiveEvent);

    const seqBefore = liveEventBus.getSequence();

    const controller = new AbortController();
    const response = await fetch(
      `http://127.0.0.1:${api.port}/live/events?since_sequence=${seqBefore - 1}`,
      { signal: controller.signal },
    );

    controller.abort();
    expect(response.status).toBe(200);
  });
});
