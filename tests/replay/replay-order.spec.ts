import { validateCanonicalEvent } from "../../packages/contracts/src/index.js";
import { orderEventsForReplay } from "../../packages/replay/src/index.js";
import {
  loadJsonFixture,
  type ReplayIncidentFixture,
} from "../../packages/test-fixtures/src/index.js";

async function loadValidatedReplayFixture() {
  const fixture = await loadJsonFixture<ReplayIncidentFixture>(
    "replay",
    "campus-after-hours-incident.json",
  );
  const events = fixture.events.map((event) => {
    const result = validateCanonicalEvent(event);

    if (result.ok) {
      return result.value;
    }

    throw new Error(result.issues.join(", "));
  });

  return { fixture, events };
}

describe("orderEventsForReplay", () => {
  it("orders the baseline replay fixture deterministically", async () => {
    const { fixture, events } = await loadValidatedReplayFixture();

    expect(orderEventsForReplay(events).map((event) => event.event_id)).toEqual(
      fixture.expected_event_order,
    );
  });

  it("produces the same ordering on repeated runs", async () => {
    const { fixture, events } = await loadValidatedReplayFixture();
    const once = orderEventsForReplay(events).map((event) => event.event_id);
    const twice = orderEventsForReplay(events).map((event) => event.event_id);

    expect(once).toEqual(fixture.expected_event_order);
    expect(twice).toEqual(fixture.expected_event_order);
  });
});
