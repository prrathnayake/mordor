import { loadJsonFixture } from "../../packages/test-fixtures/src/index.js";
import {
  setupAuthenticatedApi,
  teardownAuthenticatedApi,
} from "../helpers/authenticated-test-setup.js";

describe("replay API", () => {
  let setup: Awaited<ReturnType<typeof setupAuthenticatedApi>>;

  beforeEach(async () => {
    setup = await setupAuthenticatedApi();
  });

  afterEach(async () => {
    await teardownAuthenticatedApi(setup);
  });

  it("serves health, ingests fixture data, and returns deterministic replay results", async () => {
    const healthResponse = await fetch(`http://127.0.0.1:${setup.api.port}/health`);
    const ingestPayload = await loadJsonFixture<unknown>(
      "adapters",
      "fixture-telemetry",
      "valid.request.json",
    );
    const ingestResponse = await fetch(
      `http://127.0.0.1:${setup.api.port}/ingest/fixture-telemetry`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setup.operatorToken}`,
        },
        body: JSON.stringify(ingestPayload),
      },
    );
    const replayResponse = await fetch(`http://127.0.0.1:${setup.api.port}/replay/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({
        start_at: "2026-04-05T10:15:00Z",
        end_at: "2026-04-05T10:16:00Z",
        object_id: "veh_42",
      }),
    });

    expect(healthResponse.status).toBe(200);
    expect(ingestResponse.status).toBe(200);
    expect(replayResponse.status).toBe(200);

    const replayPayload = (await replayResponse.json()) as {
      mode: string;
      item_count: number;
      items: Array<{
        event: { event_id: string };
        state_after_event: { last_event_id: string };
      }>;
    };

    expect(replayPayload.mode).toBe("replay");
    expect(replayPayload.item_count).toBe(2);
    expect(
      replayPayload.items.map((item: { event: { event_id: string } }) => item.event.event_id),
    ).toEqual([
      "evt_veh_42_20260405T101530Z_position_observed",
      "evt_veh_42_20260405T101535Z_position_observed",
    ]);
    expect(replayPayload.items[1].state_after_event.last_event_id).toBe(
      "evt_veh_42_20260405T101535Z_position_observed",
    );
  });
});
