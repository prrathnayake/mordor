import { describe, expect, it } from "vitest";
import {
  evaluateEventForAlerts,
  evaluateLowSpeedRule,
  evaluateObjectStaleRule,
  evaluateSourceDisconnectedRule,
  evaluateSourceErrorRule,
} from "../../packages/alerts/src/rules.js";
import type { CanonicalEvent, ObjectState } from "../../packages/contracts/src/models.js";

describe("alert rules engine", () => {
  describe("evaluateObjectStaleRule", () => {
    it("triggers alert when object is stale", () => {
      const event: CanonicalEvent = {
        event_id: "evt_test",
        event_type: "position_observed",
        object_id: "obj_1",
        source_id: "src_1",
        observed_at: "2026-04-05T10:30:00Z",
        ingested_at: "2026-04-05T10:30:00Z",
        processed_at: "2026-04-05T10:30:00Z",
        schema_version: "1.0.0",
        payload: {},
        provenance: { adapter: "test", adapter_version: "1.0.0", raw_ref: "test" },
        confidence: 0.99,
        dedupe_key: "test",
        speed_mps: 5,
        heading_deg: 90,
      };

      const state: ObjectState = {
        object_id: "obj_1",
        state_version: "1.0.0",
        as_of: "2026-04-05T10:20:00Z",
        position: { lat: 0, lon: 0 },
        velocity: { speed_mps: 5, heading_deg: 90 },
        status: null,
        attributes: {},
        last_event_id: "evt_old",
      };

      const result = evaluateObjectStaleRule(event, state);

      expect(result).not.toBeNull();
      if (!result) throw new Error("expected result");
      expect(result.should_alert).toBe(true);
      expect(result.severity).toBe("warning");
      expect(result.evidence_object_ids).toContain("obj_1");
    });

    it("returns null when object is not stale", () => {
      const event: CanonicalEvent = {
        event_id: "evt_test",
        event_type: "position_observed",
        object_id: "obj_1",
        source_id: "src_1",
        observed_at: "2026-04-05T10:20:00Z",
        ingested_at: "2026-04-05T10:20:00Z",
        processed_at: "2026-04-05T10:20:00Z",
        schema_version: "1.0.0",
        payload: {},
        provenance: { adapter: "test", adapter_version: "1.0.0", raw_ref: "test" },
        confidence: 0.99,
        dedupe_key: "test",
        speed_mps: 5,
        heading_deg: 90,
      };

      const state: ObjectState = {
        object_id: "obj_1",
        state_version: "1.0.0",
        as_of: "2026-04-05T10:19:00Z",
        position: { lat: 0, lon: 0 },
        velocity: { speed_mps: 5, heading_deg: 90 },
        status: null,
        attributes: {},
        last_event_id: "evt_recent",
      };

      const result = evaluateObjectStaleRule(event, state);
      expect(result).toBeNull();
    });
  });

  describe("evaluateSourceErrorRule", () => {
    it("triggers alert on source_error event", () => {
      const event: CanonicalEvent = {
        event_id: "evt_error",
        event_type: "source_error",
        object_id: "",
        source_id: "src_1",
        observed_at: "2026-04-05T10:20:00Z",
        ingested_at: "2026-04-05T10:20:00Z",
        processed_at: "2026-04-05T10:20:00Z",
        schema_version: "1.0.0",
        payload: { error: "connection failed" },
        provenance: { adapter: "test", adapter_version: "1.0.0", raw_ref: "test" },
        confidence: 0.99,
        dedupe_key: "test",
      };

      const result = evaluateSourceErrorRule(event, null);

      expect(result).not.toBeNull();
      if (!result) throw new Error("expected result");
      expect(result.should_alert).toBe(true);
      expect(result.severity).toBe("critical");
      expect(result.evidence_event_ids).toContain("evt_error");
    });
  });

  describe("evaluateSourceDisconnectedRule", () => {
    it("triggers alert on source_disconnected event", () => {
      const event: CanonicalEvent = {
        event_id: "evt_disconnect",
        event_type: "source_disconnected",
        object_id: "",
        source_id: "src_1",
        observed_at: "2026-04-05T10:20:00Z",
        ingested_at: "2026-04-05T10:20:00Z",
        processed_at: "2026-04-05T10:20:00Z",
        schema_version: "1.0.0",
        payload: {},
        provenance: { adapter: "test", adapter_version: "1.0.0", raw_ref: "test" },
        confidence: 0.99,
        dedupe_key: "test",
      };

      const result = evaluateSourceDisconnectedRule(event, null);

      expect(result).not.toBeNull();
      if (!result) throw new Error("expected result");
      expect(result.should_alert).toBe(true);
      expect(result.severity).toBe("critical");
      expect(result.summary).toContain("disconnected");
    });

    it("returns null for non-disconnection event", () => {
      const event: CanonicalEvent = {
        event_id: "evt_pos",
        event_type: "position_observed",
        object_id: "obj_1",
        source_id: "src_1",
        observed_at: "2026-04-05T10:20:00Z",
        ingested_at: "2026-04-05T10:20:00Z",
        processed_at: "2026-04-05T10:20:00Z",
        schema_version: "1.0.0",
        payload: {},
        provenance: { adapter: "test", adapter_version: "1.0.0", raw_ref: "test" },
        confidence: 0.99,
        dedupe_key: "test",
        speed_mps: 5,
        heading_deg: 90,
      };

      const result = evaluateSourceDisconnectedRule(event, null);
      expect(result).toBeNull();
    });
  });

  describe("evaluateObjectStaleRule", () => {
    it("returns null when state is null", () => {
      const event: CanonicalEvent = {
        event_id: "evt_test",
        event_type: "position_observed",
        object_id: "obj_1",
        source_id: "src_1",
        observed_at: "2026-04-05T10:30:00Z",
        ingested_at: "2026-04-05T10:30:00Z",
        processed_at: "2026-04-05T10:30:00Z",
        schema_version: "1.0.0",
        payload: {},
        provenance: { adapter: "test", adapter_version: "1.0.0", raw_ref: "test" },
        confidence: 0.99,
        dedupe_key: "test",
        speed_mps: 5,
        heading_deg: 90,
      };

      const result = evaluateObjectStaleRule(event, null);
      expect(result).toBeNull();
    });

    it("includes correct evidence in alert", () => {
      const event: CanonicalEvent = {
        event_id: "evt_new",
        event_type: "position_observed",
        object_id: "obj_1",
        source_id: "src_1",
        observed_at: "2026-04-05T10:30:00Z",
        ingested_at: "2026-04-05T10:30:00Z",
        processed_at: "2026-04-05T10:30:00Z",
        schema_version: "1.0.0",
        payload: {},
        provenance: { adapter: "test", adapter_version: "1.0.0", raw_ref: "test" },
        confidence: 0.99,
        dedupe_key: "test",
        speed_mps: 5,
        heading_deg: 90,
      };

      const state: ObjectState = {
        object_id: "obj_1",
        state_version: "1.0.0",
        as_of: "2026-04-05T10:20:00Z",
        position: { lat: 0, lon: 0 },
        velocity: { speed_mps: 5, heading_deg: 90 },
        status: null,
        attributes: {},
        last_event_id: "evt_old",
      };

      const result = evaluateObjectStaleRule(event, state);

      expect(result).not.toBeNull();
      if (!result) throw new Error("expected result");
      expect(result.evidence_event_ids).toContain("evt_new");
      expect(result.evidence_event_ids).toContain("evt_old");
      expect(result.confidence).toBe(0.85);
    });
  });

  describe("evaluateLowSpeedRule", () => {
    it("triggers alert when object is moving slowly", () => {
      const event: CanonicalEvent = {
        event_id: "evt_slow",
        event_type: "position_observed",
        object_id: "obj_1",
        source_id: "src_1",
        observed_at: "2026-04-05T10:20:00Z",
        ingested_at: "2026-04-05T10:20:00Z",
        processed_at: "2026-04-05T10:20:00Z",
        schema_version: "1.0.0",
        payload: {},
        provenance: { adapter: "test", adapter_version: "1.0.0", raw_ref: "test" },
        confidence: 0.99,
        dedupe_key: "test",
        speed_mps: 0.1,
        heading_deg: 90,
      };

      const result = evaluateLowSpeedRule(event, null);

      expect(result).not.toBeNull();
      if (!result) throw new Error("expected result");
      expect(result.should_alert).toBe(true);
      expect(result.severity).toBe("info");
    });

    it("returns null when object is moving normally", () => {
      const event: CanonicalEvent = {
        event_id: "evt_normal",
        event_type: "position_observed",
        object_id: "obj_1",
        source_id: "src_1",
        observed_at: "2026-04-05T10:20:00Z",
        ingested_at: "2026-04-05T10:20:00Z",
        processed_at: "2026-04-05T10:20:00Z",
        schema_version: "1.0.0",
        payload: {},
        provenance: { adapter: "test", adapter_version: "1.0.0", raw_ref: "test" },
        confidence: 0.99,
        dedupe_key: "test",
        speed_mps: 10,
        heading_deg: 90,
      };

      const result = evaluateLowSpeedRule(event, null);
      expect(result).toBeNull();
    });
  });

  describe("evaluateEventForAlerts", () => {
    it("collects alerts from all rules", () => {
      const event: CanonicalEvent = {
        event_id: "evt_test",
        event_type: "source_error",
        object_id: "obj_1",
        source_id: "src_1",
        observed_at: "2026-04-05T10:20:00Z",
        ingested_at: "2026-04-05T10:20:00Z",
        processed_at: "2026-04-05T10:20:00Z",
        schema_version: "1.0.0",
        payload: { error: "test" },
        provenance: { adapter: "test", adapter_version: "1.0.0", raw_ref: "test" },
        confidence: 0.99,
        dedupe_key: "test",
        speed_mps: 5,
        heading_deg: 90,
      };

      const results = evaluateEventForAlerts(event, null);
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
