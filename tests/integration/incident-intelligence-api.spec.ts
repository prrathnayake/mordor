import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  setupAuthenticatedApi,
  teardownAuthenticatedApi,
} from "../helpers/authenticated-test-setup.js";

describe("incident intelligence API integration", () => {
  let setup: Awaited<ReturnType<typeof setupAuthenticatedApi>>;

  beforeAll(async () => {
    setup = await setupAuthenticatedApi();
  });

  afterAll(async () => {
    await teardownAuthenticatedApi(setup);
  });

  it("returns persisted intelligence artifacts, widgets, and runs for an incident", async () => {
    const incidentResponse = await fetch(`http://127.0.0.1:${setup.api.port}/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({
        title: "Incident Intelligence Test",
        description: "Verify intelligence bundle responses",
        start_at: "2026-04-14T00:00:00Z",
        end_at: "2026-04-14T06:00:00Z",
        severity: "high",
        tags: ["intel", "test"],
      }),
    });

    expect(incidentResponse.status).toBe(201);
    const incidentData = (await incidentResponse.json()) as {
      incident_id?: string;
      incident?: { incident_id: string };
    };
    const incidentId = incidentData.incident_id ?? incidentData.incident?.incident_id;
    expect(incidentId).toBeDefined();

    await setup.api.persistence.upsertIncidentIntelligenceArtifact({
      incident_id: incidentId as string,
      dedupe_key: "gdelt:alpha",
      artifact_type: "article",
      provider: "GDELT",
      title: "Article Alpha",
      summary: "Initial article coverage",
      url: "https://example.com/article-alpha",
      published_at: "2026-04-14T03:00:00Z",
      verification_status: "single_source",
      confidence: 0.62,
      source_urls: ["https://example.com/article-alpha"],
      metadata: {
        language: "en",
      },
    });

    await setup.api.persistence.upsertIncidentIntelligenceArtifact({
      incident_id: incidentId as string,
      dedupe_key: "openverse:image-1",
      artifact_type: "image",
      provider: "Openverse",
      title: "Image One",
      summary: "Representative image",
      url: "https://example.com/image-one.jpg",
      thumbnail_url: "https://example.com/image-one-thumb.jpg",
      published_at: "2026-04-14T02:00:00Z",
      lat: 35.6892,
      lon: 51.389,
      verification_status: "cross_checked",
      confidence: 0.81,
      source_urls: ["https://example.com/source-image-one"],
      metadata: {
        license: "cc-by",
      },
    });

    await setup.api.persistence.upsertIncidentWidgetManifest({
      incident_id: incidentId as string,
      widget_key: "related-articles",
      widget_type: "related_articles",
      title: "Related Articles",
      layout: "primary",
      priority: 10,
      generated_by: "incident-intelligence-worker",
      spec: {
        artifact_ids: ["gdelt:alpha"],
      },
    });

    await setup.api.persistence.createIncidentIntelligenceRun({
      run_id: "run_intel_001",
      incident_id: incidentId as string,
      provider: "incident-intelligence-worker",
      run_type: "fusion",
      status: "completed",
      started_at: "2026-04-14T03:05:00Z",
      completed_at: "2026-04-14T03:05:05Z",
      stats: {
        artifacts_upserted: 2,
        widgets_upserted: 1,
      },
    });

    const response = await fetch(
      `http://127.0.0.1:${setup.api.port}/incidents/${incidentId}/intelligence`,
      {
        headers: { Authorization: `Bearer ${setup.operatorToken}` },
      },
    );

    expect(response.status).toBe(200);
    const intelligence = (await response.json()) as {
      incident_id: string;
      artifacts: Array<{ artifact_type: string; title: string }>;
      widgets: Array<{ widget_type: string; title: string }>;
      runs: Array<{ provider: string; status: string }>;
    };

    expect(intelligence.incident_id).toBe(incidentId);
    expect(intelligence.artifacts.map((artifact) => artifact.title)).toEqual([
      "Article Alpha",
      "Image One",
    ]);
    expect(intelligence.widgets).toHaveLength(1);
    expect(intelligence.widgets[0]?.widget_type).toBe("related_articles");
    expect(intelligence.runs).toHaveLength(1);
    expect(intelligence.runs[0]).toMatchObject({
      provider: "incident-intelligence-worker",
      status: "completed",
    });
  });

  it("returns 404 when incident intelligence is requested for a missing incident", async () => {
    const response = await fetch(
      `http://127.0.0.1:${setup.api.port}/incidents/inc_missing/intelligence`,
      {
        headers: { Authorization: `Bearer ${setup.operatorToken}` },
      },
    );

    expect(response.status).toBe(404);
  });
});
