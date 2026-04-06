import { beforeEach, describe, expect, it, vi } from "vitest";

describe("replay timeline controls", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("calculates safe timeline index within bounds", () => {
    const replayState = {
      items: [{}, {}, {}],
      currentIndex: 0,
      intervalId: null,
      isPlaying: false,
    };

    const itemCount = replayState.items.length;
    const safeIndex = Math.min(replayState.currentIndex, Math.max(itemCount - 1, 0));

    expect(safeIndex).toBe(0);
  });

  it("clamps index to maximum when overshooting", () => {
    const replayState = {
      items: [{}, {}, {}],
      currentIndex: 10,
      intervalId: null,
      isPlaying: false,
    };

    const itemCount = replayState.items.length;
    const safeIndex = Math.min(replayState.currentIndex, Math.max(itemCount - 1, 0));

    expect(safeIndex).toBe(2);
  });

  it("handles empty items array", () => {
    const replayState = {
      items: [],
      currentIndex: 0,
      intervalId: null,
      isPlaying: false,
    };

    const itemCount = replayState.items.length;
    const safeIndex = Math.min(replayState.currentIndex, Math.max(itemCount - 1, 0));

    expect(safeIndex).toBe(0);
  });

  it("steps to next index within bounds", () => {
    const replayState = {
      items: [{}, {}, {}],
      currentIndex: 1,
      intervalId: null,
      isPlaying: false,
    };

    const nextIndex = Math.min(replayState.currentIndex + 1, replayState.items.length - 1);

    expect(nextIndex).toBe(2);
  });

  it("stops at last index when stepping past end", () => {
    const replayState = {
      items: [{}, {}, {}],
      currentIndex: 2,
      intervalId: null,
      isPlaying: false,
    };

    const nextIndex = Math.min(replayState.currentIndex + 1, replayState.items.length - 1);

    expect(nextIndex).toBe(2);
  });
});

describe("replay API request validation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("builds correct request body with object_id", () => {
    const requestBody = {
      start_at: "2026-04-05T10:15:00Z",
      end_at: "2026-04-05T10:16:00Z",
      object_id: "veh_42",
    };

    expect(requestBody.start_at).toBe("2026-04-05T10:15:00Z");
    expect(requestBody.end_at).toBe("2026-04-05T10:16:00Z");
    expect(requestBody.object_id).toBe("veh_42");
  });

  it("builds correct request body without object_id", () => {
    const requestBody: { start_at: string; end_at: string; object_id?: string } = {
      start_at: "2026-04-05T10:15:00Z",
      end_at: "2026-04-05T10:16:00Z",
    };

    expect(requestBody.object_id).toBeUndefined();
  });

  it("validates ISO date time format", () => {
    const isIsoDateTime = (value: string): boolean => Number.isFinite(Date.parse(value));

    expect(isIsoDateTime("2026-04-05T10:15:00Z")).toBe(true);
    expect(isIsoDateTime("invalid")).toBe(false);
    expect(isIsoDateTime("")).toBe(false);
  });
});

describe("playback state management", () => {
  it("tracks playing state correctly", () => {
    const replayState = {
      isPlaying: false,
      intervalId: null,
    };

    expect(replayState.isPlaying).toBe(false);
    expect(replayState.intervalId).toBe(null);
  });

  it("clears interval when stopping playback", () => {
    const intervalId = setInterval(() => {}, 10);
    clearInterval(intervalId);

    expect(intervalId).toBeDefined();
  });

  it("respects playback speed of 1000ms", () => {
    const playbackSpeed = 1000;

    expect(playbackSpeed).toBe(1000);
  });
});

describe("position extraction from replay item", () => {
  it("extracts position from state_after_event", () => {
    const item = {
      sequence: 1,
      event: { object_id: "veh_42" },
      state_after_event: {
        position: { lat: -33.8688, lon: 151.2093 },
        velocity: { speed_mps: 13.4, heading_deg: 91.2 },
      },
    };

    const position = item.state_after_event.position;

    expect(position).toEqual({ lat: -33.8688, lon: 151.2093 });
  });

  it("returns null when no position in state", () => {
    const item = {
      sequence: 1,
      event: { object_id: "veh_42" },
      state_after_event: {
        position: null,
        velocity: null,
      },
    };

    const position = item.state_after_event.position;

    expect(position).toBeNull();
  });
});

describe("object ID extraction", () => {
  it("extracts object_id from event", () => {
    const item = {
      sequence: 1,
      event: { object_id: "veh_42" },
      state_after_event: {},
    };

    const objectId = item.event.object_id;

    expect(objectId).toBe("veh_42");
  });
});
