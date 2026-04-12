import type {
  SwanFinding,
  SwanFindingVerificationStatus,
  SwanProjectionTarget,
  SwanSession,
  SwanThread,
} from "../../contracts/src/index.js";
import type { Logger } from "../../logging/src/index.js";
import { allowsLiveProjection, getAoiCenter } from "./projections.js";
import type { SwanRepository } from "./repository.js";

export interface SwanGeneratedFinding {
  provider: string;
  target_type: SwanFinding["target_type"];
  target_id: string;
  finding_kind: string;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  verification_status: SwanFindingVerificationStatus;
  confidence: number;
  projection_targets: SwanProjectionTarget[];
  source_urls: string[];
  media: SwanFinding["media"];
  lat: number | null;
  lon: number | null;
}

export interface SwanProviderContext {
  session: SwanSession;
  thread: SwanThread;
  repository: SwanRepository;
}

export type SwanProvider = (context: SwanProviderContext) => Promise<SwanGeneratedFinding[]>;

function pushProjectionTarget(
  projectionTargets: SwanProjectionTarget[],
  target: SwanProjectionTarget,
): SwanProjectionTarget[] {
  return projectionTargets.includes(target) ? projectionTargets : [...projectionTargets, target];
}

export const appContextProvider: SwanProvider = async ({ thread, repository }) => {
  if (thread.target_type === "object" && thread.target_id) {
    const objectContext = await repository.fetchObjectContext(thread.target_id);
    if (!objectContext) {
      return [];
    }

    const relatedAlerts = await repository.fetchAlertsByObject(thread.target_id);
    const recentEvents = await repository.fetchRecentObjectEvents(thread.target_id, 5);
    const projectionTargets =
      objectContext.lat !== null && objectContext.lon !== null
        ? (["panel", "map"] as SwanProjectionTarget[])
        : (["panel"] as SwanProjectionTarget[]);

    return [
      {
        provider: "app_context",
        target_type: "object",
        target_id: thread.target_id,
        finding_kind: "object_context",
        title: objectContext.display_name || `Object ${thread.target_id}`,
        summary: `${thread.target_id} is ${objectContext.status ?? "active"} as of ${objectContext.as_of}${relatedAlerts.length > 0 ? ` with ${relatedAlerts.length} related alert(s)` : ""}.`,
        details: {
          object_type: objectContext.object_type,
          source_primary: objectContext.source_primary,
          status: objectContext.status,
          attributes: objectContext.attributes,
          last_event_id: objectContext.last_event_id,
          related_alerts: relatedAlerts,
          recent_events: recentEvents,
        },
        verification_status: "trusted_source",
        confidence: 0.95,
        projection_targets: projectionTargets,
        source_urls: [],
        media: [],
        lat: objectContext.lat,
        lon: objectContext.lon,
      },
    ];
  }

  if (thread.target_type === "alert" && thread.target_id) {
    const alertContext = await repository.fetchAlertContext(thread.target_id);
    if (!alertContext) {
      return [];
    }

    return [
      {
        provider: "app_context",
        target_type: "alert",
        target_id: thread.target_id,
        finding_kind: "alert_context",
        title: `Alert ${thread.target_id}`,
        summary: `${alertContext.summary} (${alertContext.severity.toUpperCase()} / ${alertContext.status.toUpperCase()})`,
        details: {
          explanation: alertContext.explanation,
          evidence_event_ids: alertContext.evidence_event_ids,
          evidence_object_ids: alertContext.evidence_object_ids,
          confidence: alertContext.confidence,
        },
        verification_status: "trusted_source",
        confidence: alertContext.confidence,
        projection_targets: ["panel", "notification"],
        source_urls: [],
        media: [],
        lat: null,
        lon: null,
      },
    ];
  }

  if (thread.target_type === "incident" && thread.target_id) {
    const incidentContext = await repository.fetchIncidentContext(thread.target_id);
    if (!incidentContext) {
      return [];
    }

    const evidenceSummary = await repository.fetchIncidentEvidenceSummary(thread.target_id);
    const center = getAoiCenter(incidentContext.aoi);
    let projectionTargets: SwanProjectionTarget[] = ["panel", "notification"];
    if (center) {
      projectionTargets = pushProjectionTarget(projectionTargets, "map");
    }

    return [
      {
        provider: "app_context",
        target_type: "incident",
        target_id: thread.target_id,
        finding_kind: "incident_context",
        title: incidentContext.title,
        summary: `${incidentContext.severity.toUpperCase()} incident with ${evidenceSummary.evidence_count} evidence freeze(s) and ${evidenceSummary.completed_jobs}/${evidenceSummary.total_jobs} completed capture job(s).`,
        details: {
          description: incidentContext.description,
          start_at: incidentContext.start_at,
          end_at: incidentContext.end_at,
          status: incidentContext.status,
          tags: incidentContext.tags,
          aoi: incidentContext.aoi,
        },
        verification_status: "trusted_source",
        confidence: 0.94,
        projection_targets: projectionTargets,
        source_urls: [],
        media: [],
        lat: center?.lat ?? null,
        lon: center?.lon ?? null,
      },
    ];
  }

  if (thread.target_type === "layer" && thread.target_id) {
    const layer = await repository.fetchLayerSummary(thread.target_id);
    if (!layer) {
      return [];
    }

    return [
      {
        provider: "app_context",
        target_type: "layer",
        target_id: thread.target_id,
        finding_kind: "layer_context",
        title: `${layer.layer_id} layer status`,
        summary: `${layer.source_name} is ${layer.status.toUpperCase()} with ${layer.record_count} record(s).`,
        details: {
          error_message: layer.error_message,
          source_url: layer.source_url,
        },
        verification_status: "trusted_source",
        confidence: 0.9,
        projection_targets: ["panel"],
        source_urls: layer.source_url ? [layer.source_url] : [],
        media: [],
        lat: null,
        lon: null,
      },
    ];
  }

  if (
    (thread.target_type === "mode" || thread.target_type === "replay_window") &&
    thread.target_id
  ) {
    return [
      {
        provider: "app_context",
        target_type: thread.target_type,
        target_id: thread.target_id,
        finding_kind: "session_window",
        title: `Session focus: ${thread.target_id}`,
        summary: `Swan is monitoring the current ${thread.target_type.replace("_", " ")} context.`,
        details: thread.context,
        verification_status: "trusted_source",
        confidence: 0.82,
        projection_targets: ["panel"],
        source_urls: [],
        media: [],
        lat: null,
        lon: null,
      },
    ];
  }

  return [];
};

export const existingExternalLayersProvider: SwanProvider = async ({ thread, repository }) => {
  const layers = await repository.fetchExternalLayerSummaries();
  if (layers.length === 0) {
    return [];
  }

  if (thread.target_type === "object" && thread.target_id) {
    const objectContext = await repository.fetchObjectContext(thread.target_id);
    if (!objectContext || objectContext.lat === null || objectContext.lon === null) {
      return [];
    }

    const nearestSource = await repository.fetchNearestSourceToPoint(
      objectContext.lat,
      objectContext.lon,
    );
    const activeLayerUrls = layers
      .filter((layer) => layer.source_url)
      .map((layer) => layer.source_url as string);
    const verificationStatus: SwanFindingVerificationStatus =
      activeLayerUrls.length >= 2 ? "cross_checked" : "trusted_source";
    let projectionTargets: SwanProjectionTarget[] = ["panel"];
    if (nearestSource?.lat !== null && nearestSource?.lon !== null) {
      projectionTargets = pushProjectionTarget(projectionTargets, "map");
    }

    return [
      {
        provider: "existing_external_layers",
        target_type: "object",
        target_id: thread.target_id,
        finding_kind: "external_layer_context",
        title: `External context for ${thread.target_id}`,
        summary: nearestSource
          ? `Nearest source is ${nearestSource.label} (${nearestSource.provider}) at ${nearestSource.distance_m.toFixed(0)}m, with ${layers.length} external layer(s) available.`
          : `${layers.length} external layer(s) are available for corroboration.`,
        details: {
          nearest_source: nearestSource,
          layers: layers.map((layer) => ({
            layer_id: layer.layer_id,
            status: layer.status,
            record_count: layer.record_count,
            last_fetch_at: layer.last_fetch_at,
          })),
        },
        verification_status: verificationStatus,
        confidence: 0.78,
        projection_targets: projectionTargets,
        source_urls: activeLayerUrls,
        media: [],
        lat: nearestSource?.lat ?? objectContext.lat,
        lon: nearestSource?.lon ?? objectContext.lon,
      },
    ];
  }

  if (thread.target_type === "alert" && thread.target_id) {
    const links = await repository.fetchSourceLinks("alert", thread.target_id);
    if (links.length === 0) {
      return [];
    }

    return [
      {
        provider: "existing_external_layers",
        target_type: "alert",
        target_id: thread.target_id,
        finding_kind: "linked_sources",
        title: `Linked sources for ${thread.target_id}`,
        summary: `${links.length} source link(s) are associated with this alert.`,
        details: {
          links,
        },
        verification_status: "cross_checked",
        confidence: 0.76,
        projection_targets: ["panel"],
        source_urls: [],
        media: [],
        lat: null,
        lon: null,
      },
    ];
  }

  if (thread.target_type === "incident" && thread.target_id) {
    const links = await repository.fetchSourceLinks("incident", thread.target_id);
    return [
      {
        provider: "existing_external_layers",
        target_type: "incident",
        target_id: thread.target_id,
        finding_kind: "incident_sources",
        title: `Incident source context`,
        summary:
          links.length > 0
            ? `${links.length} source link(s) are attached to this incident.`
            : `${layers.length} external layer(s) remain available for incident correlation.`,
        details: {
          links,
          layers: layers.map((layer) => ({
            layer_id: layer.layer_id,
            status: layer.status,
            record_count: layer.record_count,
          })),
        },
        verification_status: layers.length >= 2 ? "cross_checked" : "single_source",
        confidence: 0.7,
        projection_targets: ["panel"],
        source_urls: layers
          .filter((layer) => layer.source_url)
          .map((layer) => layer.source_url as string),
        media: [],
        lat: null,
        lon: null,
      },
    ];
  }

  if (thread.target_type === "layer" && thread.target_id) {
    const layer = layers.find((entry) => entry.layer_id === thread.target_id);
    if (!layer) {
      return [];
    }

    const verificationStatus: SwanFindingVerificationStatus = layer.source_url
      ? "single_source"
      : "trusted_source";
    let projectionTargets: SwanProjectionTarget[] = ["panel"];
    if (
      (layer.status === "error" || layer.status === "degraded") &&
      allowsLiveProjection("cross_checked")
    ) {
      projectionTargets = pushProjectionTarget(projectionTargets, "notification");
    }

    return [
      {
        provider: "existing_external_layers",
        target_type: "layer",
        target_id: thread.target_id,
        finding_kind: "layer_corrobation",
        title: `Layer corroboration: ${layer.layer_id}`,
        summary: `${layer.source_name} reported ${layer.record_count} record(s) and is ${layer.status.toUpperCase()}.`,
        details: layer,
        verification_status: verificationStatus,
        confidence: 0.72,
        projection_targets: projectionTargets,
        source_urls: layer.source_url ? [layer.source_url] : [],
        media: [],
        lat: null,
        lon: null,
      },
    ];
  }

  return [];
};

export function createExternalResearchProvider(input: {
  logger: Logger;
  externalResearchFeeds: string[];
}): SwanProvider {
  return async ({ thread }) => {
    if (input.externalResearchFeeds.length === 0 || !thread.target_type || !thread.target_id) {
      return [];
    }

    const matches: Array<{
      title: string;
      summary: string;
      url: string;
      thumbnail_url: string | null;
      media_type: "image" | "video" | null;
      lat: number | null;
      lon: number | null;
    }> = [];

    for (const feedUrl of input.externalResearchFeeds) {
      try {
        const response = await fetch(feedUrl);
        if (!response.ok) {
          continue;
        }

        const payload = (await response.json()) as {
          items?: Array<{
            title?: string;
            summary?: string;
            url?: string;
            target_id?: string;
            tags?: string[];
            thumbnail_url?: string;
            media_type?: "image" | "video";
            lat?: number;
            lon?: number;
          }>;
        };

        for (const item of payload.items ?? []) {
          const tagMatch = Array.isArray(item.tags)
            ? item.tags.some((tag) => tag === thread.target_id)
            : false;

          if (item.target_id === thread.target_id || tagMatch) {
            matches.push({
              title: item.title ?? "External research finding",
              summary: item.summary ?? "Matched configured external research feed.",
              url: item.url ?? feedUrl,
              thumbnail_url: item.thumbnail_url ?? null,
              media_type: item.media_type ?? null,
              lat: typeof item.lat === "number" ? item.lat : null,
              lon: typeof item.lon === "number" ? item.lon : null,
            });
          }
        }
      } catch (error) {
        input.logger.warn("Swan external research fetch failed", {
          feed_url: feedUrl,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (matches.length === 0) {
      return [];
    }

    const uniqueHosts = new Set(matches.map((match) => new URL(match.url).host));
    const verificationStatus: SwanFindingVerificationStatus =
      uniqueHosts.size >= 2 ? "cross_checked" : "single_source";
    let projectionTargets: SwanProjectionTarget[] = ["panel"];
    if (allowsLiveProjection(verificationStatus)) {
      projectionTargets = pushProjectionTarget(projectionTargets, "notification");
    }

    const firstMatch = matches[0];
    if (
      allowsLiveProjection(verificationStatus) &&
      firstMatch.lat !== null &&
      firstMatch.lon !== null
    ) {
      projectionTargets = pushProjectionTarget(projectionTargets, "map");
    }

    return [
      {
        provider: "external_research",
        target_type: thread.target_type,
        target_id: thread.target_id,
        finding_kind: "external_research",
        title: firstMatch.title,
        summary: firstMatch.summary,
        details: {
          matches: matches.map((match) => ({
            title: match.title,
            summary: match.summary,
            url: match.url,
          })),
        },
        verification_status: verificationStatus,
        confidence: uniqueHosts.size >= 2 ? 0.74 : 0.58,
        projection_targets: projectionTargets,
        source_urls: matches.map((match) => match.url),
        media: firstMatch.media_type
          ? [
              {
                media_type: firstMatch.media_type,
                url: firstMatch.url,
                thumbnail_url: firstMatch.thumbnail_url,
                title: firstMatch.title,
              },
            ]
          : [],
        lat: firstMatch.lat,
        lon: firstMatch.lon,
      },
    ];
  };
}
