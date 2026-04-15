import { describe, expect, it } from "vitest";
import type {
  CreateIncidentIntelligenceRunInput,
  IncidentIntelligenceArtifact,
  IncidentIntelligenceBundle,
  IncidentIntelligenceRun,
  IncidentWidgetManifest,
  UpsertIncidentIntelligenceArtifactInput,
  UpsertIncidentWidgetManifestInput,
} from "../../packages/contracts/src/index.js";
import {
  type IncidentIntelligenceCollector,
  refreshIncidentIntelligence,
} from "../../packages/intelligence/src/index.js";
import type { Logger } from "../../packages/logging/src/index.js";
import type { PostgresPersistenceGateway } from "../../packages/persistence/src/index.js";

function createFakeLogger(): Logger {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

function createFakePersistence(): PostgresPersistenceGateway {
  const artifacts = new Map<string, IncidentIntelligenceArtifact>();
  const widgets = new Map<string, IncidentWidgetManifest>();
  const runs = new Map<string, IncidentIntelligenceRun>();

  return {
    async createIncidentIntelligenceRun(input: CreateIncidentIntelligenceRunInput) {
      runs.set(input.run_id, {
        run_id: input.run_id,
        incident_id: input.incident_id,
        provider: input.provider,
        run_type: input.run_type,
        status: input.status,
        started_at: input.started_at,
        completed_at: input.completed_at ?? null,
        error_message: input.error_message ?? null,
        stats: input.stats ?? {},
        created_at: input.started_at,
        updated_at: input.completed_at ?? input.started_at,
      });
    },
    async upsertIncidentIntelligenceArtifact(input: UpsertIncidentIntelligenceArtifactInput) {
      artifacts.set(input.dedupe_key, {
        artifact_id: input.dedupe_key,
        incident_id: input.incident_id,
        dedupe_key: input.dedupe_key,
        artifact_type: input.artifact_type,
        provider: input.provider,
        title: input.title,
        summary: input.summary ?? "",
        url: input.url,
        thumbnail_url: input.thumbnail_url ?? null,
        author: input.author ?? null,
        published_at: input.published_at ?? null,
        captured_at: input.captured_at ?? "2026-04-15T00:00:00Z",
        lat: input.lat ?? null,
        lon: input.lon ?? null,
        verification_status: input.verification_status,
        confidence: input.confidence,
        source_urls: input.source_urls ?? [],
        metadata: input.metadata ?? {},
        created_at: "2026-04-15T00:00:00Z",
        updated_at: "2026-04-15T00:00:00Z",
      });
    },
    async listIncidentIntelligenceArtifacts() {
      return [...artifacts.values()].sort((left, right) => right.title.localeCompare(left.title));
    },
    async upsertIncidentWidgetManifest(input: UpsertIncidentWidgetManifestInput) {
      widgets.set(input.widget_key, {
        widget_id: input.widget_key,
        incident_id: input.incident_id,
        widget_key: input.widget_key,
        widget_type: input.widget_type,
        title: input.title,
        layout: input.layout,
        priority: input.priority ?? 100,
        status: input.status ?? "active",
        generated_by: input.generated_by,
        spec: input.spec,
        created_at: "2026-04-15T00:00:00Z",
        updated_at: "2026-04-15T00:00:00Z",
      });
    },
    async listIncidentWidgetManifests() {
      return [...widgets.values()].sort((left, right) => left.priority - right.priority);
    },
    async listIncidentIntelligenceRuns() {
      return [...runs.values()].sort((left, right) => left.run_id.localeCompare(right.run_id));
    },
    async getIncidentIntelligenceBundle(incidentId: string): Promise<IncidentIntelligenceBundle> {
      return {
        incident_id: incidentId,
        artifacts: [...artifacts.values()],
        widgets: [...widgets.values()].sort((left, right) => left.priority - right.priority),
        runs: [...runs.values()],
      };
    },
  } as unknown as PostgresPersistenceGateway;
}

describe("incident intelligence service", () => {
  it("generates map-context widgets from AOIs and geolocated artifacts", async () => {
    const persistence = createFakePersistence();
    const logger = createFakeLogger();
    const collectors: IncidentIntelligenceCollector[] = [
      {
        provider: "FakeNews",
        runType: "articles",
        async collect() {
          return [
            {
              incident_id: "inc_map_context",
              dedupe_key: "fake-news:1",
              artifact_type: "article",
              provider: "FakeNews",
              title: "Strike Report",
              summary: "Synthetic article",
              url: "https://example.com/article",
              lat: 35.6892,
              lon: 51.389,
              verification_status: "single_source",
              confidence: 0.6,
            },
          ];
        },
      },
      {
        provider: "FakeMedia",
        runType: "images",
        async collect() {
          return [
            {
              incident_id: "inc_map_context",
              dedupe_key: "fake-media:1",
              artifact_type: "image",
              provider: "FakeMedia",
              title: "Street Photo",
              summary: "Synthetic image",
              url: "https://example.com/image.jpg",
              verification_status: "unverified",
              confidence: 0.35,
            },
          ];
        },
      },
    ];

    const result = await refreshIncidentIntelligence({
      incident: {
        incident_id: "inc_map_context",
        title: "Tehran Incident",
        description: "Synthetic incident for map-context fusion",
        start_at: "2026-04-15T00:00:00Z",
        end_at: "2026-04-15T06:00:00Z",
        status: "open",
        severity: "critical",
        tags: ["iran", "conflict"],
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
      },
      persistence,
      logger,
      collectors,
    });

    const mapContext = result.intelligence.widgets.find(
      (widget) => widget.widget_type === "map_context",
    );
    const summary = result.intelligence.widgets.find((widget) => widget.widget_type === "summary");
    const patternBrief = result.intelligence.widgets.find(
      (widget) => widget.widget_type === "pattern_brief",
    );

    expect(result.artifact_count).toBe(2);
    expect(mapContext?.spec).toMatchObject({
      has_incident_aoi: true,
      located_artifact_count: 1,
      total_artifact_count: 2,
      focus: {
        source: "incident_aoi",
      },
    });
    expect(summary?.spec).toMatchObject({
      located_artifact_count: 1,
    });
    expect(patternBrief?.spec).toMatchObject({
      notes: expect.arrayContaining(["Mapped 1 geolocated artifacts onto the incident context."]),
    });
  });
});
