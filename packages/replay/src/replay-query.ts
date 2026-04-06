import type { CanonicalEvent, ObjectState } from "../../contracts/src/models.js";
import { applyCanonicalEventToObjectState } from "../../domain/src/index.js";
import { orderEventsForReplay } from "./replay-order.js";

export const REPLAY_QUERY_RESPONSE_VERSION = "1.0.0";

export interface ReplayQueryRequest {
  start_at: string;
  end_at: string;
  object_id?: string;
}

export interface ReplayTimelineItem {
  sequence: number;
  event: CanonicalEvent;
  state_after_event: ObjectState;
}

export interface ReplayQueryResponse {
  response_version: typeof REPLAY_QUERY_RESPONSE_VERSION;
  mode: "replay";
  requested_window: {
    start_at: string;
    end_at: string;
    object_id: string | null;
  };
  item_count: number;
  items: ReplayTimelineItem[];
}

export interface ReplayQueryRepository {
  fetchCanonicalEvents(input: ReplayQueryRequest): Promise<CanonicalEvent[]>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDateTime(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function validateReplayQueryRequest(
  input: unknown,
): { ok: true; value: ReplayQueryRequest } | { ok: false; issues: string[] } {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: ["replay query request must be an object"],
    };
  }

  const issues: string[] = [];

  if (typeof input.start_at !== "string" || !isIsoDateTime(input.start_at)) {
    issues.push("start_at must be a valid ISO-8601 date-time string");
  }

  if (typeof input.end_at !== "string" || !isIsoDateTime(input.end_at)) {
    issues.push("end_at must be a valid ISO-8601 date-time string");
  }

  if (
    input.object_id !== undefined &&
    (typeof input.object_id !== "string" || input.object_id.trim() === "")
  ) {
    issues.push("object_id must be a non-empty string when provided");
  }

  if (
    typeof input.start_at === "string" &&
    typeof input.end_at === "string" &&
    isIsoDateTime(input.start_at) &&
    isIsoDateTime(input.end_at) &&
    Date.parse(input.start_at) > Date.parse(input.end_at)
  ) {
    issues.push("start_at must be less than or equal to end_at");
  }

  if (issues.length > 0) {
    return {
      ok: false,
      issues,
    };
  }

  return {
    ok: true,
    value: {
      start_at: new Date(input.start_at as string).toISOString(),
      end_at: new Date(input.end_at as string).toISOString(),
      object_id: typeof input.object_id === "string" ? input.object_id.trim() : undefined,
    },
  };
}

export async function buildReplayQueryResponse(input: {
  request: ReplayQueryRequest;
  repository: ReplayQueryRepository;
}): Promise<ReplayQueryResponse> {
  const orderedEvents = orderEventsForReplay(
    await input.repository.fetchCanonicalEvents(input.request),
  );
  const currentStateByObjectId = new Map<string, ObjectState>();

  const items = orderedEvents.map((event, index) => {
    const currentState = currentStateByObjectId.get(event.object_id) ?? null;
    const nextState = applyCanonicalEventToObjectState(currentState, event);
    currentStateByObjectId.set(event.object_id, nextState);

    return {
      sequence: index + 1,
      event,
      state_after_event: nextState,
    };
  });

  return {
    response_version: REPLAY_QUERY_RESPONSE_VERSION,
    mode: "replay",
    requested_window: {
      start_at: input.request.start_at,
      end_at: input.request.end_at,
      object_id: input.request.object_id ?? null,
    },
    item_count: items.length,
    items,
  };
}
