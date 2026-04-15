import { createHash, randomUUID } from "node:crypto";
import type {
  IncidentIntelligenceArtifactType,
  IncidentIntelligenceBundle,
  IncidentIntelligenceRunType,
  UpsertIncidentIntelligenceArtifactInput,
} from "../../contracts/src/index.js";
import { createHttpClient } from "../../external-data/src/http-client.js";
import type { Logger } from "../../logging/src/index.js";
import type { PostgresPersistenceGateway } from "../../persistence/src/index.js";

export interface IncidentIntelligenceCollectorInput {
  incident: IncidentIntelligenceTarget;
  query: string;
  logger: Logger;
  youtubeApiKey?: string | null;
}

export interface IncidentIntelligenceTarget {
  incident_id: string;
  title: string;
  description: string;
  start_at: string;
  end_at: string;
  status: string;
  severity: string;
  tags: string[];
  aoi?: Record<string, unknown> | null;
}

export interface IncidentIntelligenceCollector {
  provider: string;
  runType: IncidentIntelligenceRunType;
  collect(
    input: IncidentIntelligenceCollectorInput,
  ): Promise<UpsertIncidentIntelligenceArtifactInput[]>;
}

export interface IncidentIntelligenceRefreshResult {
  incident_id: string;
  artifact_count: number;
  widget_count: number;
  run_count: number;
  query: string;
  intelligence: IncidentIntelligenceBundle;
  updated_at: string;
}

export interface IncidentIntelligenceSweepResult {
  incident_count: number;
  refreshed: IncidentIntelligenceRefreshResult[];
  updated_at: string;
}

const gdeltHttpClient = createHttpClient({
  timeoutMs: 20000,
  rateLimitMs: 1000,
  maxRetries: 2,
});

const openverseHttpClient = createHttpClient({
  timeoutMs: 20000,
  rateLimitMs: 1000,
  maxRetries: 2,
});

const youtubeHttpClient = createHttpClient({
  timeoutMs: 20000,
  rateLimitMs: 1000,
  maxRetries: 2,
});

interface GdeltArticle {
  title?: string;
  url?: string;
  domain?: string;
  seendate?: string;
  socialimage?: string;
  language?: string;
  sourcecountry?: string;
}

interface OpenverseImage {
  id?: string;
  title?: string;
  url?: string;
  thumbnail?: string;
  creator?: string;
  license?: string;
  detail_url?: string;
}

interface YouTubeItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    thumbnails?: {
      medium?: { url?: string };
      high?: { url?: string };
    };
    publishedAt?: string;
    channelTitle?: string;
  };
}

function createArtifactDedupeKey(
  provider: string,
  artifactType: IncidentIntelligenceArtifactType,
  url: string,
): string {
  return `${provider}:${artifactType}:${createHash("sha1").update(url).digest("hex")}`;
}

function cleanQueryPart(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildIncidentIntelligenceQuery(incident: IncidentIntelligenceTarget): string {
  const parts = [incident.title, ...(incident.tags ?? []), incident.description]
    .map((value) => cleanQueryPart(value || ""))
    .filter(Boolean);

  return parts.slice(0, 6).join(" ");
}

function collectCoordinatePairs(
  value: unknown,
  pairs: Array<{ lat: number; lon: number }> = [],
): Array<{ lat: number; lon: number }> {
  if (!Array.isArray(value)) {
    return pairs;
  }

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  ) {
    pairs.push({
      lon: value[0],
      lat: value[1],
    });
    return pairs;
  }

  for (const entry of value) {
    collectCoordinatePairs(entry, pairs);
  }

  return pairs;
}

function getIncidentReferenceLocation(
  incident: IncidentIntelligenceTarget,
): { lat: number; lon: number; source: string; geometry_type: string | null } | null {
  if (!incident.aoi || typeof incident.aoi !== "object") {
    return null;
  }

  const geometry = incident.aoi as Record<string, unknown> & {
    type?: string;
    coordinates?: unknown;
  };
  const points = collectCoordinatePairs(geometry.coordinates);

  if (points.length === 0) {
    return null;
  }

  const lats = points.map((point) => point.lat);
  const lons = points.map((point) => point.lon);

  return {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lon: (Math.min(...lons) + Math.max(...lons)) / 2,
    source: geometry.type === "Point" ? "incident_point" : "incident_aoi",
    geometry_type: typeof geometry.type === "string" ? geometry.type : null,
  };
}

function buildMapContextSpec(
  incident: IncidentIntelligenceTarget,
  artifacts: IncidentIntelligenceBundle["artifacts"],
): Record<string, unknown> | null {
  const locatedArtifacts = artifacts.filter(
    (artifact) => typeof artifact.lat === "number" && typeof artifact.lon === "number",
  );
  const incidentLocation = getIncidentReferenceLocation(incident);

  if (!incidentLocation && locatedArtifacts.length === 0) {
    return null;
  }

  const artifactItems = locatedArtifacts.slice(0, 8).map((artifact) => ({
    artifact_id: artifact.artifact_id,
    title: artifact.title,
    provider: artifact.provider,
    artifact_type: artifact.artifact_type,
    lat: artifact.lat,
    lon: artifact.lon,
    confidence: artifact.confidence,
    verification_status: artifact.verification_status,
    url: artifact.url,
    published_at: artifact.published_at,
  }));

  const fallbackFocus =
    artifactItems.length > 0
      ? {
          lat:
            artifactItems.reduce((sum, item) => sum + Number(item.lat ?? 0), 0) /
            artifactItems.length,
          lon:
            artifactItems.reduce((sum, item) => sum + Number(item.lon ?? 0), 0) /
            artifactItems.length,
          source: "artifact_cluster",
          geometry_type: null,
        }
      : null;

  const focus = incidentLocation ?? fallbackFocus;

  if (!focus) {
    return null;
  }

  return {
    focus: {
      lat: focus.lat,
      lon: focus.lon,
      source: focus.source,
      geometry_type: focus.geometry_type,
    },
    has_incident_aoi: Boolean(incidentLocation),
    located_artifact_count: locatedArtifacts.length,
    total_artifact_count: artifacts.length,
    items: artifactItems,
  };
}

export function createGdeltArticleCollector(): IncidentIntelligenceCollector {
  return {
    provider: "GDELT",
    runType: "articles",
    async collect(input) {
      const url = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
      url.searchParams.set("query", input.query);
      url.searchParams.set("mode", "artlist");
      url.searchParams.set("maxrecords", "6");
      url.searchParams.set("sort", "datedesc");
      url.searchParams.set("format", "json");

      const response = await gdeltHttpClient.get(url.toString());
      if (!response.ok) {
        throw new Error(`GDELT returned ${response.status}`);
      }

      const payload = (await response.json()) as { articles?: GdeltArticle[] };

      return (payload.articles ?? [])
        .filter((article) => article.url && article.title)
        .map((article) => ({
          incident_id: input.incident.incident_id,
          dedupe_key: createArtifactDedupeKey("GDELT", "article", article.url as string),
          artifact_type: "article" as const,
          provider: "GDELT",
          title: article.title as string,
          summary: `Discovered via GDELT article search for "${input.query}".`,
          url: article.url as string,
          thumbnail_url: article.socialimage ?? null,
          author: article.domain ?? null,
          published_at: article.seendate ? new Date(article.seendate).toISOString() : null,
          verification_status: "single_source" as const,
          confidence: 0.55,
          source_urls: [article.url as string],
          metadata: {
            domain: article.domain ?? null,
            language: article.language ?? null,
            source_country: article.sourcecountry ?? null,
          },
        }));
    },
  };
}

export function createOpenverseImageCollector(): IncidentIntelligenceCollector {
  return {
    provider: "Openverse",
    runType: "images",
    async collect(input) {
      const url = new URL("https://api.openverse.org/v1/images/");
      url.searchParams.set("q", input.query);
      url.searchParams.set("page_size", "6");

      const response = await openverseHttpClient.get(url.toString());
      if (!response.ok) {
        throw new Error(`Openverse returned ${response.status}`);
      }

      const payload = (await response.json()) as { results?: OpenverseImage[] };

      return (payload.results ?? [])
        .filter((image) => image.url)
        .map((image) => ({
          incident_id: input.incident.incident_id,
          dedupe_key: createArtifactDedupeKey("Openverse", "image", image.url as string),
          artifact_type: "image" as const,
          provider: "Openverse",
          title: image.title || "Openverse image",
          summary: `Image discovered for "${input.query}".`,
          url: image.url as string,
          thumbnail_url: image.thumbnail ?? null,
          author: image.creator ?? null,
          verification_status: "unverified" as const,
          confidence: 0.4,
          source_urls: image.detail_url ? [image.detail_url] : [image.url as string],
          metadata: {
            openverse_id: image.id ?? null,
            license: image.license ?? null,
            detail_url: image.detail_url ?? null,
          },
        }));
    },
  };
}

export function createYouTubeVideoCollector(
  youtubeApiKey: string | null | undefined,
): IncidentIntelligenceCollector | null {
  if (!youtubeApiKey) {
    return null;
  }

  return {
    provider: "YouTube",
    runType: "videos",
    async collect(input) {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.searchParams.set("part", "snippet");
      url.searchParams.set("type", "video");
      url.searchParams.set("maxResults", "6");
      url.searchParams.set("q", input.query);
      url.searchParams.set("key", youtubeApiKey);

      const response = await youtubeHttpClient.get(url.toString());
      if (!response.ok) {
        throw new Error(`YouTube returned ${response.status}`);
      }

      const payload = (await response.json()) as { items?: YouTubeItem[] };

      return (payload.items ?? [])
        .filter((item) => item.id?.videoId)
        .map((item) => ({
          incident_id: input.incident.incident_id,
          dedupe_key: createArtifactDedupeKey(
            "YouTube",
            "video",
            `https://www.youtube.com/watch?v=${item.id?.videoId}`,
          ),
          artifact_type: "video" as const,
          provider: "YouTube",
          title: item.snippet?.title || "YouTube video",
          summary: item.snippet?.description || `Video discovered for "${input.query}".`,
          url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
          thumbnail_url:
            item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.medium?.url ?? null,
          author: item.snippet?.channelTitle ?? null,
          published_at: item.snippet?.publishedAt ?? null,
          verification_status: "unverified" as const,
          confidence: 0.35,
          source_urls: [`https://www.youtube.com/watch?v=${item.id?.videoId}`],
          metadata: {
            video_id: item.id?.videoId ?? null,
            channel: item.snippet?.channelTitle ?? null,
          },
        }));
    },
  };
}

export function createDefaultIncidentIntelligenceCollectors(input?: {
  youtubeApiKey?: string | null;
}): IncidentIntelligenceCollector[] {
  const collectors: IncidentIntelligenceCollector[] = [
    createGdeltArticleCollector(),
    createOpenverseImageCollector(),
  ];
  const youtubeCollector = createYouTubeVideoCollector(input?.youtubeApiKey ?? null);
  if (youtubeCollector) {
    collectors.push(youtubeCollector);
  }
  return collectors;
}

async function upsertGeneratedWidgets(
  persistence: PostgresPersistenceGateway,
  incident: IncidentIntelligenceTarget,
  artifacts: IncidentIntelligenceBundle["artifacts"],
): Promise<void> {
  const incidentId = incident.incident_id;
  const articles = artifacts.filter((artifact) => artifact.artifact_type === "article");
  const media = artifacts.filter(
    (artifact) => artifact.artifact_type === "image" || artifact.artifact_type === "video",
  );
  const locatedArtifacts = artifacts.filter(
    (artifact) => typeof artifact.lat === "number" && typeof artifact.lon === "number",
  );
  const providerCounts = artifacts.reduce<Record<string, number>>((accumulator, artifact) => {
    accumulator[artifact.provider] = (accumulator[artifact.provider] ?? 0) + 1;
    return accumulator;
  }, {});
  const mapContextSpec = buildMapContextSpec(incident, artifacts);

  await persistence.upsertIncidentWidgetManifest({
    incident_id: incidentId,
    widget_key: "summary",
    widget_type: "summary",
    title: "Incident Summary",
    layout: "primary",
    priority: 10,
    generated_by: "incident-intelligence-service",
    spec: {
      article_count: articles.length,
      media_count: media.length,
      located_artifact_count: locatedArtifacts.length,
      providers: providerCounts,
      latest_artifact_at: artifacts[0]?.published_at ?? artifacts[0]?.captured_at ?? null,
    },
  });

  if (mapContextSpec) {
    await persistence.upsertIncidentWidgetManifest({
      incident_id: incidentId,
      widget_key: "map-context",
      widget_type: "map_context",
      title: "Map Context",
      layout: "context",
      priority: 15,
      generated_by: "incident-intelligence-service",
      spec: mapContextSpec,
    });
  }

  await persistence.upsertIncidentWidgetManifest({
    incident_id: incidentId,
    widget_key: "source-provenance",
    widget_type: "source_provenance",
    title: "Source Provenance",
    layout: "context",
    priority: 30,
    generated_by: "incident-intelligence-service",
    spec: {
      providers: Object.entries(providerCounts).map(([provider, count]) => ({
        provider,
        count,
      })),
      verification_breakdown: artifacts.reduce<Record<string, number>>((accumulator, artifact) => {
        accumulator[artifact.verification_status] =
          (accumulator[artifact.verification_status] ?? 0) + 1;
        return accumulator;
      }, {}),
    },
  });

  if (articles.length > 0) {
    await persistence.upsertIncidentWidgetManifest({
      incident_id: incidentId,
      widget_key: "related-articles",
      widget_type: "related_articles",
      title: "Related Articles",
      layout: "primary",
      priority: 20,
      generated_by: "incident-intelligence-service",
      spec: {
        items: articles.slice(0, 5).map((artifact) => ({
          artifact_id: artifact.artifact_id,
          title: artifact.title,
          url: artifact.url,
          provider: artifact.provider,
          published_at: artifact.published_at,
          thumbnail_url: artifact.thumbnail_url,
        })),
      },
    });
  }

  if (media.length > 0) {
    await persistence.upsertIncidentWidgetManifest({
      incident_id: incidentId,
      widget_key: "media-gallery",
      widget_type: "media_gallery",
      title: "Media Gallery",
      layout: "secondary",
      priority: 40,
      generated_by: "incident-intelligence-service",
      spec: {
        items: media.slice(0, 8).map((artifact) => ({
          artifact_id: artifact.artifact_id,
          title: artifact.title,
          url: artifact.url,
          thumbnail_url: artifact.thumbnail_url,
          artifact_type: artifact.artifact_type,
          provider: artifact.provider,
        })),
      },
    });
  }

  await persistence.upsertIncidentWidgetManifest({
    incident_id: incidentId,
    widget_key: "pattern-brief",
    widget_type: "pattern_brief",
    title: "Pattern Brief",
    layout: "secondary",
    priority: 50,
    generated_by: "incident-intelligence-service",
    spec: {
      notes: [
        articles.length > 0
          ? `Collected ${articles.length} article references for trend review.`
          : "No article references collected yet.",
        media.length > 0
          ? `Collected ${media.length} media references for visual triage.`
          : "No media references collected yet.",
        locatedArtifacts.length > 0
          ? `Mapped ${locatedArtifacts.length} geolocated artifacts onto the incident context.`
          : "No geolocated artifacts collected yet.",
      ],
    },
  });
}

export async function refreshIncidentIntelligence(input: {
  incident: IncidentIntelligenceTarget;
  persistence: PostgresPersistenceGateway;
  logger: Logger;
  collectors?: IncidentIntelligenceCollector[];
  youtubeApiKey?: string | null;
}): Promise<IncidentIntelligenceRefreshResult> {
  const query = buildIncidentIntelligenceQuery(input.incident);
  const collectors =
    input.collectors ??
    createDefaultIncidentIntelligenceCollectors({ youtubeApiKey: input.youtubeApiKey });

  for (const collector of collectors) {
    const runId = `intel_${collector.provider.toLowerCase()}_${randomUUID()}`;
    const startedAt = new Date().toISOString();
    await input.persistence.createIncidentIntelligenceRun({
      run_id: runId,
      incident_id: input.incident.incident_id,
      provider: collector.provider,
      run_type: collector.runType,
      status: "running",
      started_at: startedAt,
      stats: {
        query,
      },
    });

    try {
      const artifacts = await collector.collect({
        incident: input.incident,
        query,
        logger: input.logger,
        youtubeApiKey: input.youtubeApiKey,
      });

      for (const artifact of artifacts) {
        await input.persistence.upsertIncidentIntelligenceArtifact(artifact);
      }

      await input.persistence.createIncidentIntelligenceRun({
        run_id: runId,
        incident_id: input.incident.incident_id,
        provider: collector.provider,
        run_type: collector.runType,
        status: "completed",
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        stats: {
          query,
          artifact_count: artifacts.length,
        },
      });
    } catch (error) {
      input.logger.warn("Incident intelligence collector failed", {
        incident_id: input.incident.incident_id,
        provider: collector.provider,
        error: error instanceof Error ? error.message : String(error),
      });

      await input.persistence.createIncidentIntelligenceRun({
        run_id: runId,
        incident_id: input.incident.incident_id,
        provider: collector.provider,
        run_type: collector.runType,
        status: "failed",
        started_at: startedAt,
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : String(error),
        stats: {
          query,
        },
      });
    }
  }

  const artifacts = await input.persistence.listIncidentIntelligenceArtifacts(
    input.incident.incident_id,
  );
  await upsertGeneratedWidgets(input.persistence, input.incident, artifacts);
  const intelligence = await input.persistence.getIncidentIntelligenceBundle(
    input.incident.incident_id,
  );

  return {
    incident_id: input.incident.incident_id,
    artifact_count: intelligence.artifacts.length,
    widget_count: intelligence.widgets.length,
    run_count: intelligence.runs.length,
    query,
    intelligence,
    updated_at: new Date().toISOString(),
  };
}

export async function refreshOpenIncidentIntelligence(input: {
  persistence: PostgresPersistenceGateway;
  logger: Logger;
  collectors?: IncidentIntelligenceCollector[];
  youtubeApiKey?: string | null;
  limit?: number;
}): Promise<IncidentIntelligenceSweepResult> {
  const incidents = await input.persistence.fetchIncidents({
    limit: input.limit ?? 10,
  });
  const activeIncidents = incidents.filter(
    (incident) => incident.status === "open" || incident.status === "investigating",
  );
  const refreshed: IncidentIntelligenceRefreshResult[] = [];

  for (const summary of activeIncidents) {
    const incident = await input.persistence.fetchIncident(summary.incident_id);
    if (!incident) {
      continue;
    }

    refreshed.push(
      await refreshIncidentIntelligence({
        incident,
        persistence: input.persistence,
        logger: input.logger,
        collectors: input.collectors,
        youtubeApiKey: input.youtubeApiKey,
      }),
    );
  }

  return {
    incident_count: refreshed.length,
    refreshed,
    updated_at: new Date().toISOString(),
  };
}
