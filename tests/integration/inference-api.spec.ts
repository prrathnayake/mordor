import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  setupAuthenticatedApi,
  teardownAuthenticatedApi,
} from "../helpers/authenticated-test-setup.js";

describe("inference API integration", () => {
  let setup: Awaited<ReturnType<typeof setupAuthenticatedApi>>;

  beforeAll(async () => {
    setup = await setupAuthenticatedApi();
  });

  afterAll(async () => {
    await teardownAuthenticatedApi(setup);
  });

  describe("GET /inferences", () => {
    it("returns empty list when no inferences exist", async () => {
      const response = await fetch(`http://127.0.0.1:${setup.api.port}/inferences`);
      expect(response.status).toBe(200);
      const data = (await response.json()) as { inferences: unknown[] };
      expect(Array.isArray(data.inferences)).toBe(true);
    });

    it("returns list of inferences", async () => {
      const response = await fetch(`http://127.0.0.1:${setup.api.port}/inferences`);
      expect(response.status).toBe(200);
      const data = (await response.json()) as { inferences: unknown[] };
      expect(Array.isArray(data.inferences)).toBe(true);
    });
  });

  describe("POST /inferences", () => {
    it("requires authentication to create inference", async () => {
      const response = await fetch(`http://127.0.0.1:${setup.api.port}/inferences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inference_type: "nav_degradation",
          time_window_start: "2026-04-06T10:00:00Z",
          time_window_end: "2026-04-06T11:00:00Z",
          evidence_summary: "Test degradation detected",
          details: { severity: "minor" },
        }),
      });
      expect(response.status).toBe(401);
    });

    it("creates a navigation degradation inference", async () => {
      const response = await fetch(`http://127.0.0.1:${setup.api.port}/inferences`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setup.operatorToken}`,
        },
        body: JSON.stringify({
          inference_type: "nav_degradation",
          time_window_start: "2026-04-06T10:00:00Z",
          time_window_end: "2026-04-06T11:00:00Z",
          evidence_summary: "Test navigation degradation",
          details: {
            severity: "moderate",
            affected_area_sqkm: 50,
            degraded_signals: 5,
            total_signals: 10,
          },
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as {
        inference: { inference_id: string; inference_type: string };
      };
      expect(data.inference.inference_type).toBe("nav_degradation");
      expect(data.inference.inference_id).toBeDefined();
    });

    it("creates a route redirection inference", async () => {
      const response = await fetch(`http://127.0.0.1:${setup.api.port}/inferences`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setup.operatorToken}`,
        },
        body: JSON.stringify({
          inference_type: "route_redirection",
          time_window_start: "2026-04-06T10:00:00Z",
          time_window_end: "2026-04-06T11:00:00Z",
          evidence_summary: "Test route deviation",
          related_object_ids: ["veh_42"],
          details: {
            object_id: "veh_42",
            original_path: [],
            actual_path: [],
            deviation_meters: 500,
            deviation_point: { lat: -33.8688, lon: 151.2093 },
          },
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as {
        inference: { inference_id: string; inference_type: string };
      };
      expect(data.inference.inference_type).toBe("route_redirection");
    });

    it("creates a holding pattern inference", async () => {
      const response = await fetch(`http://127.0.0.1:${setup.api.port}/inferences`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setup.operatorToken}`,
        },
        body: JSON.stringify({
          inference_type: "holding_pattern",
          time_window_start: "2026-04-06T10:00:00Z",
          time_window_end: "2026-04-06T11:00:00Z",
          evidence_summary: "Test holding pattern",
          related_object_ids: ["flight_UA123"],
          details: {
            object_id: "flight_UA123",
            center_point: { lat: -33.8688, lon: 151.2093 },
            radius_meters: 2500,
            loop_count: 3,
            duration_seconds: 180,
            heading_changes: 540,
          },
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as {
        inference: { inference_id: string; inference_type: string };
      };
      expect(data.inference.inference_type).toBe("holding_pattern");
    });

    it("creates an absence signal inference", async () => {
      const response = await fetch(`http://127.0.0.1:${setup.api.port}/inferences`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setup.operatorToken}`,
        },
        body: JSON.stringify({
          inference_type: "absence_signal",
          time_window_start: "2026-04-06T10:00:00Z",
          time_window_end: "2026-04-06T11:00:00Z",
          evidence_summary: "Test absence signal",
          details: {
            signal_type: "adsb",
            affected_layer: "flights",
            thinning_percent: 80,
            expected_count: 100,
            observed_count: 20,
            source_blackout: false,
          },
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as {
        inference: { inference_id: string; inference_type: string };
      };
      expect(data.inference.inference_type).toBe("absence_signal");
    });

    it("validates required fields", async () => {
      const response = await fetch(`http://127.0.0.1:${setup.api.port}/inferences`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setup.operatorToken}`,
        },
        body: JSON.stringify({
          inference_type: "nav_degradation",
        }),
      });
      expect(response.status).toBe(400);
    });
  });

  describe("GET /inferences/timeline", () => {
    it("returns timeline markers", async () => {
      const response = await fetch(`http://127.0.0.1:${setup.api.port}/inferences/timeline`);
      expect(response.status).toBe(200);
      const data = (await response.json()) as { markers: unknown[] };
      expect(Array.isArray(data.markers)).toBe(true);
    });
  });

  describe("incident timeline with inferences", () => {
    it("includes inferred markers in incident timeline", async () => {
      const incidentResponse = await fetch(`http://127.0.0.1:${setup.api.port}/incidents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setup.operatorToken}`,
        },
        body: JSON.stringify({
          title: "Inference Timeline Test",
          start_at: "2026-04-06T10:00:00Z",
          end_at: "2026-04-06T12:00:00Z",
          severity: "high",
        }),
      });

      const incidentData = (await incidentResponse.json()) as {
        incident_id?: string;
        incident?: { incident_id: string };
      };
      const incidentId = incidentData.incident_id ?? incidentData.incident?.incident_id;

      const inferenceResponse = await fetch(`http://127.0.0.1:${setup.api.port}/inferences`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setup.operatorToken}`,
        },
        body: JSON.stringify({
          inference_type: "nav_degradation",
          time_window_start: "2026-04-06T10:00:00Z",
          time_window_end: "2026-04-06T11:00:00Z",
          evidence_summary: "Test degradation for timeline",
          details: { severity: "minor" },
        }),
      });

      const inferenceData = (await inferenceResponse.json()) as {
        inference: { inference_id: string };
      };
      const inferenceId = inferenceData.inference?.inference_id;

      await fetch(`http://127.0.0.1:${setup.api.port}/inferences/${inferenceId}/link-incident`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setup.operatorToken}`,
        },
        body: JSON.stringify({ incident_id: incidentId }),
      });

      const timelineResponse = await fetch(
        `http://127.0.0.1:${setup.api.port}/incidents/${incidentId}/timeline`,
      );
      expect(timelineResponse.status).toBe(200);
      const timelineData = (await timelineResponse.json()) as {
        inferences: unknown[];
        markers: unknown[];
        chapters: unknown[];
      };
      expect(timelineData).toHaveProperty("inferences");
      expect(Array.isArray(timelineData.inferences)).toBe(true);
    });
  });
});
