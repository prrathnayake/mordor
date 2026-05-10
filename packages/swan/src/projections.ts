import type {
  SwanArtifactProjection,
  SwanFinding,
  SwanMapOverlay,
  SwanNotificationItem,
  SwanSession,
  SwanThread,
} from "../../contracts/src/index.js";
import { SWAN_ARTIFACT_PROJECTION_SCHEMA_VERSION } from "../../contracts/src/index.js";

function nowIso(): string {
  return new Date().toISOString();
}

export function allowsLiveProjection(
  verificationStatus: SwanFinding["verification_status"],
): boolean {
  return verificationStatus === "cross_checked" || verificationStatus === "trusted_source";
}

export function summarizeThreadCounts(threads: SwanThread[]): Record<string, number> {
  return threads.reduce<Record<string, number>>((accumulator, thread) => {
    accumulator[thread.status] = (accumulator[thread.status] ?? 0) + 1;
    return accumulator;
  }, {});
}

export function buildPanelsProjection(
  sessionId: string,
  findings: SwanFinding[],
): SwanArtifactProjection {
  const objects: Record<string, SwanFinding[]> = {};
  const alerts: Record<string, SwanFinding[]> = {};
  const incidents: Record<string, SwanFinding[]> = {};

  for (const finding of findings) {
    if (!finding.projection_targets.includes("panel")) {
      continue;
    }

    if (finding.target_type === "object") {
      objects[finding.target_id] = [...(objects[finding.target_id] ?? []), finding];
      continue;
    }

    if (finding.target_type === "alert") {
      alerts[finding.target_id] = [...(alerts[finding.target_id] ?? []), finding];
      continue;
    }

    if (finding.target_type === "incident") {
      incidents[finding.target_id] = [...(incidents[finding.target_id] ?? []), finding];
    }
  }

  return {
    schema_version: SWAN_ARTIFACT_PROJECTION_SCHEMA_VERSION,
    session_id: sessionId,
    projection: "panels",
    generated_at: nowIso(),
    data: {
      objects,
      alerts,
      incidents,
    },
  };
}

export function buildMapProjection(
  sessionId: string,
  findings: SwanFinding[],
): SwanArtifactProjection {
  const overlays: SwanMapOverlay[] = findings
    .filter(
      (finding) =>
        finding.projection_targets.includes("map") &&
        finding.lat !== null &&
        finding.lon !== null &&
        allowsLiveProjection(finding.verification_status),
    )
    .map((finding) => ({
      finding_id: finding.finding_id,
      target_type: finding.target_type,
      target_id: finding.target_id,
      kind: finding.finding_kind,
      title: finding.title,
      verification_status: finding.verification_status,
      lat: finding.lat as number,
      lon: finding.lon as number,
    }));

  return {
    schema_version: SWAN_ARTIFACT_PROJECTION_SCHEMA_VERSION,
    session_id: sessionId,
    projection: "map",
    generated_at: nowIso(),
    data: {
      overlays,
    },
  };
}

export function buildNotificationsProjection(
  sessionId: string,
  findings: SwanFinding[],
): SwanArtifactProjection {
  const items: SwanNotificationItem[] = findings
    .filter(
      (finding) =>
        finding.projection_targets.includes("notification") &&
        allowsLiveProjection(finding.verification_status),
    )
    .map((finding) => ({
      finding_id: finding.finding_id,
      target_type: finding.target_type,
      target_id: finding.target_id,
      title: finding.title,
      summary: finding.summary,
      verification_status: finding.verification_status,
      generated_at: finding.generated_at,
    }));

  return {
    schema_version: SWAN_ARTIFACT_PROJECTION_SCHEMA_VERSION,
    session_id: sessionId,
    projection: "notifications",
    generated_at: nowIso(),
    data: {
      unread_count: items.length,
      items,
    },
  };
}

export function buildSessionProjection(
  session: SwanSession,
  threads: SwanThread[],
): SwanArtifactProjection {
  return {
    schema_version: SWAN_ARTIFACT_PROJECTION_SCHEMA_VERSION,
    session_id: session.session_id,
    projection: "session",
    generated_at: nowIso(),
    data: {
      session,
      thread_counts: summarizeThreadCounts(threads),
    },
  };
}

export function buildZoomProjection(
  sessionId: string,
  findings: SwanFinding[],
): SwanArtifactProjection {
  const zoomFindings = findings.filter(
    (finding) =>
      finding.finding_kind === "zoom_context" && finding.projection_targets.includes("panel"),
  );

  return {
    schema_version: SWAN_ARTIFACT_PROJECTION_SCHEMA_VERSION,
    session_id: sessionId,
    projection: "zoom",
    generated_at: nowIso(),
    data: {
      zoom_findings: zoomFindings,
    },
  };
}

export function buildThreadArtifact(
  thread: SwanThread,
  findings: SwanFinding[],
): Record<string, unknown> {
  return {
    schema_version: SWAN_ARTIFACT_PROJECTION_SCHEMA_VERSION,
    thread,
    findings,
    generated_at: nowIso(),
  };
}

export function getAoiCenter(
  aoi: Record<string, unknown> | null,
): { lat: number; lon: number } | null {
  if (!aoi || typeof aoi !== "object") {
    return null;
  }

  const geometry = aoi as { type?: string; coordinates?: unknown };

  if (
    geometry.type === "Point" &&
    Array.isArray(geometry.coordinates) &&
    geometry.coordinates.length >= 2
  ) {
    const [lon, lat] = geometry.coordinates;
    if (typeof lat === "number" && typeof lon === "number") {
      return { lat, lon };
    }
  }

  if (!Array.isArray(geometry.coordinates)) {
    return null;
  }

  const [firstRing] = geometry.coordinates;
  if (geometry.type === "Polygon" && Array.isArray(firstRing) && firstRing.length > 0) {
    const ring = firstRing.filter(
      (coordinate): coordinate is [number, number] =>
        Array.isArray(coordinate) &&
        coordinate.length >= 2 &&
        typeof coordinate[0] === "number" &&
        typeof coordinate[1] === "number",
    );
    if (ring.length === 0) {
      return null;
    }
    const totals = ring.reduce(
      (accumulator, coordinate) => ({
        lat: accumulator.lat + coordinate[1],
        lon: accumulator.lon + coordinate[0],
      }),
      { lat: 0, lon: 0 },
    );
    return {
      lat: totals.lat / ring.length,
      lon: totals.lon / ring.length,
    };
  }

  return null;
}
