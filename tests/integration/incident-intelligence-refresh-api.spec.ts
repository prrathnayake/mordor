import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { IncidentIntelligenceCollector } from "../../packages/intelligence/src/index.js";
import {
  setupAuthenticatedApi,
  teardownAuthenticatedApi,
} from "../helpers/authenticated-test-setup.js";

describe("incident intelligence refresh API integration", () => {
  let setup: Awaited<ReturnType<typeof setupAuthenticatedApi>>;

  beforeAll(async () => {
    const collectors: IncidentIntelligenceCollector[] = [
      {
        provider: "FakeNews",
        runType: "articles",
        async collect(input) {
          return [
            {
              incident_id: input.incident.incident_id,
              dedupe_key: "fake-news:1",
              artifact_type: "article",
              provider: "FakeNews",
              title: "Simulated Article",
              summary: "Synthetic article used for integration testing.",
              url: "https://example.com/simulated-article",
              lat: 35.6892,
              lon: 51.389,
              verification_status: "single_source",
              confidence: 0.6,
              source_urls: ["https://example.com/simulated-article"],
              metadata: {
                query: input.query,
              },
            },
          ];
        },
      },
      {
        provider: "FakeMedia",
        runType: "images",
        async collect(input) {
          return [
            {
              incident_id: input.incident.incident_id,
              dedupe_key: "fake-media:1",
              artifact_type: "image",
              provider: "FakeMedia",
              title: "Simulated Image",
              summary: "Synthetic image used for integration testing.",
              url: "https://example.com/simulated-image.jpg",
              thumbnail_url: "https://example.com/simulated-image-thumb.jpg",
              verification_status: "unverified",
              confidence: 0.3,
              source_urls: ["https://example.com/simulated-image.jpg"],
              metadata: {
                query: input.query,
              },
            },
          ];
        },
      },
    ];

    setup = await setupAuthenticatedApi({
      incidentIntelligenceCollectors: collectors,
    });
  });

  afterAll(async () => {
    await teardownAuthenticatedApi(setup);
  });

  it("refreshes incident intelligence and persists generated widgets", async () => {
    const incidentResponse = await fetch(`http://127.0.0.1:${setup.api.port}/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({
        title: "Refresh Incident Intelligence",
        description: "Refresh route integration test",
        start_at: "2026-04-14T00:00:00Z",
        end_at: "2026-04-14T06:00:00Z",
        aoi: {
          type: "Polygon",
          coordinates: [
            [
              [51.32, 35.64],
              [51.46, 35.64],
              [51.46, 35.76],
              [51.32, 35.76],
              [51.32, 35.64],
            ],
          ],
        },
        severity: "critical",
        tags: ["conflict", "iran"],
      }),
    });

    expect(incidentResponse.status).toBe(201);
    const incidentData = (await incidentResponse.json()) as {
      incident_id?: string;
      incident?: { incident_id: string };
    };
    const incidentId = incidentData.incident_id ?? incidentData.incident?.incident_id;

    const refreshResponse = await fetch(
      `http://127.0.0.1:${setup.api.port}/incidents/${incidentId}/intelligence/refresh`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${setup.operatorToken}` },
      },
    );

    expect(refreshResponse.status).toBe(200);
    const refreshed = (await refreshResponse.json()) as {
      artifact_count: number;
      widget_count: number;
      run_count: number;
      query: string;
    };

    expect(refreshed.artifact_count).toBe(2);
    expect(refreshed.widget_count).toBeGreaterThanOrEqual(3);
    expect(refreshed.run_count).toBe(2);
    expect(refreshed.query).toContain("Refresh Incident Intelligence");

    const intelligenceResponse = await fetch(
      `http://127.0.0.1:${setup.api.port}/incidents/${incidentId}/intelligence`,
      {
        headers: { Authorization: `Bearer ${setup.operatorToken}` },
      },
    );

    expect(intelligenceResponse.status).toBe(200);
    const intelligence = (await intelligenceResponse.json()) as {
      artifacts: Array<{ title: string }>;
      widgets: Array<{ widget_key: string; widget_type: string; spec?: Record<string, unknown> }>;
      runs: Array<{ provider: string; status: string }>;
    };

    expect(intelligence.artifacts.map((artifact) => artifact.title)).toEqual(
      expect.arrayContaining(["Simulated Article", "Simulated Image"]),
    );
    expect(intelligence.widgets.some((widget) => widget.widget_key === "summary")).toBe(true);
    expect(intelligence.widgets.some((widget) => widget.widget_key === "map-context")).toBe(true);
    expect(intelligence.widgets.some((widget) => widget.widget_key === "source-provenance")).toBe(
      true,
    );
    expect(
      intelligence.widgets.find((widget) => widget.widget_type === "map_context")?.spec,
    ).toMatchObject({
      has_incident_aoi: true,
      located_artifact_count: 1,
      total_artifact_count: 2,
      focus: {
        source: "incident_aoi",
      },
    });
    expect(intelligence.runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ provider: "FakeNews", status: "completed" }),
        expect.objectContaining({ provider: "FakeMedia", status: "completed" }),
      ]),
    );
  });
});
