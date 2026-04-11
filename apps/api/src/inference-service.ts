/**
 * Inference Service
 *
 * Implements derived operational intelligence for MORDOR.
 * All inferred outputs are explicitly marked as inferred, scored, and evidence-backed.
 */

import type { Logger } from "../../../packages/logging/src/index.js";
import type { PostgresPersistenceGateway } from "../../../packages/persistence/src/index.js";

export interface NavDegradationResult {
  detected: boolean;
  zoneId?: string;
  severity?: "minor" | "moderate" | "severe";
  confidence?: number;
  affectedAreaSqkm?: number;
  degradedSignals?: number;
  totalSignals?: number;
  error?: string;
}

export interface RouteRedirectionResult {
  detected: boolean;
  redirectionId?: string;
  objectId?: string;
  deviationMeters?: number;
  deviationPoint?: { lat: number; lon: number };
  probableCause?: string;
  error?: string;
}

export interface HoldingPatternResult {
  detected: boolean;
  patternId?: string;
  objectId?: string;
  centerPoint?: { lat: number; lon: number };
  radiusMeters?: number;
  loopCount?: number;
  durationSeconds?: number;
  orbitType?: string;
  error?: string;
}

export interface AbsenceSignalResult {
  detected: boolean;
  inferenceId?: string;
  signalType?: string;
  thinningPercent?: number;
  expectedCount?: number;
  observedCount?: number;
  sourceBlackout?: boolean;
  confidence?: number;
  error?: string;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculatePolygonArea(coordinates: Array<[number, number]>): number {
  if (coordinates.length < 3) return 0;
  let area = 0;
  const n = coordinates.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += coordinates[i][0] * coordinates[j][1];
    area -= coordinates[j][0] * coordinates[i][1];
  }
  area = Math.abs(area) / 2;
  const avgLat = coordinates.reduce((sum, c) => sum + c[1], 0) / n;
  const latDegToKm = 111.32;
  const lonDegToKm = 111.32 * Math.cos((avgLat * Math.PI) / 180);
  return area * latDegToKm * lonDegToKm;
}

export async function detectNavigationDegradation(
  persistence: PostgresPersistenceGateway,
  logger: Logger,
  bounds?: { north: number; south: number; east: number; west: number },
): Promise<NavDegradationResult> {
  try {
    const boundsCondition = bounds
      ? `WHERE ST_Y(position) BETWEEN ${bounds.south} AND ${bounds.north}
         AND ST_X(position) BETWEEN ${bounds.west} AND ${bounds.east}`
      : "";

    const result = await persistence.getDatabase().pool.query(`
      SELECT 
        COUNT(*) as total_objects,
        COUNT(CASE WHEN speed_mps < 50 THEN 1 END) as slow_objects,
        ST_Extent(position::geometry) as extent
      FROM latest_object_states
      ${boundsCondition}
    `);

    const row = result.rows[0];
    const totalObjects = parseInt(row.total_objects, 10);
    const slowObjects = parseInt(row.slow_objects, 10);

    if (totalObjects === 0) {
      return { detected: false };
    }

    const slowPercent = slowObjects / totalObjects;
    const confidence = Math.min(0.95, 0.3 + slowPercent * 0.6);

    let severity: "minor" | "moderate" | "severe";
    if (slowPercent >= 0.5) {
      severity = "severe";
    } else if (slowPercent >= 0.3) {
      severity = "moderate";
    } else {
      severity = "minor";
    }

    let estimatedAreaSqkm = 100;
    if (row.extent) {
      const extentParts = row.extent.match(/BOX\(([^,]+),([^)]+)\)/);
      if (extentParts) {
        const minCoords = extentParts[1].split(" ");
        const maxCoords = extentParts[2].split(" ");
        estimatedAreaSqkm = calculatePolygonArea([
          [parseFloat(minCoords[1]), parseFloat(minCoords[0])],
          [parseFloat(minCoords[1]), parseFloat(maxCoords[0])],
          [parseFloat(maxCoords[1]), parseFloat(maxCoords[0])],
          [parseFloat(maxCoords[1]), parseFloat(minCoords[0])],
        ]);
      }
    }

    const evidenceSummary = `${severity} navigation degradation detected: ${slowObjects}/${totalObjects} objects showing degraded movement (${(slowPercent * 100).toFixed(1)}%)`;

    const zoneId = await persistence.createDegradationZone({
      polygon: {
        type: "Polygon",
        coordinates: bounds
          ? [
              [
                [bounds.west, bounds.south],
                [bounds.east, bounds.south],
                [bounds.east, bounds.north],
                [bounds.west, bounds.north],
                [bounds.west, bounds.south],
              ],
            ]
          : [
              [
                [-180, -90],
                [180, -90],
                [180, 90],
                [-180, 90],
                [-180, -90],
              ],
            ],
      },
      severity,
      confidence,
      affected_signals: slowObjects,
      estimated_area_sqkm: estimatedAreaSqkm,
      evidence_refs: [`nav_degradation_${Date.now()}`],
    });

    const _inferenceId = await persistence.createInferredEvent({
      inference_type: "nav_degradation",
      confidence,
      confidence_level:
        confidence >= 0.9
          ? "very_high"
          : confidence >= 0.7
            ? "high"
            : confidence >= 0.5
              ? "medium"
              : "low",
      time_window_start: new Date(Date.now() - 300000).toISOString(),
      time_window_end: new Date().toISOString(),
      evidence_summary: evidenceSummary,
      details: {
        severity,
        affected_area_sqkm: estimatedAreaSqkm,
        degraded_signals: slowObjects,
        total_signals: totalObjects,
        raw_metrics: {
          slow_percent: slowPercent,
          total_objects: totalObjects,
        },
      },
    });

    logger.info("Navigation degradation detected", {
      severity,
      confidence,
      affected_signals: slowObjects,
      total_signals: totalObjects,
    });

    return {
      detected: true,
      zoneId,
      severity,
      confidence,
      affectedAreaSqkm: estimatedAreaSqkm,
      degradedSignals: slowObjects,
      totalSignals: totalObjects,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Nav degradation detection failed", { error: message });
    return { detected: false, error: message };
  }
}

export async function detectRouteRedirection(
  persistence: PostgresPersistenceGateway,
  logger: Logger,
  objectId: string,
  expectedPath: Array<{ lat: number; lon: number }>,
  actualPositions: Array<{ lat: number; lon: number; timestamp: string }>,
  deviationThresholdMeters: number = 500,
): Promise<RouteRedirectionResult> {
  try {
    if (actualPositions.length < 2 || expectedPath.length < 2) {
      return { detected: false };
    }

    let maxDeviation = 0;
    let deviationPoint = actualPositions[0];

    for (const actual of actualPositions) {
      let minDistToExpected = Infinity;
      for (const expected of expectedPath) {
        const dist = calculateDistance(actual.lat, actual.lon, expected.lat, expected.lon);
        minDistToExpected = Math.min(minDistToExpected, dist);
      }
      if (minDistToExpected > maxDeviation) {
        maxDeviation = minDistToExpected;
        deviationPoint = actual;
      }
    }

    if (maxDeviation < deviationThresholdMeters) {
      return { detected: false };
    }

    const confidence = Math.min(0.95, 0.4 + (maxDeviation / 10000) * 0.5);

    let probableCause = "Unknown";
    if (maxDeviation > 5000) {
      probableCause = "Significant route deviation";
    } else if (maxDeviation > 2000) {
      probableCause = "Moderate route deviation";
    }

    const evidenceSummary = `Route redirection detected for ${objectId}: ${maxDeviation.toFixed(0)}m deviation from expected path`;

    const inferenceId = await persistence.createInferredEvent({
      inference_type: "route_redirection",
      confidence,
      confidence_level:
        confidence >= 0.9
          ? "very_high"
          : confidence >= 0.7
            ? "high"
            : confidence >= 0.5
              ? "medium"
              : "low",
      time_window_start: actualPositions[0].timestamp,
      time_window_end: actualPositions[actualPositions.length - 1].timestamp,
      related_object_ids: [objectId],
      evidence_summary: evidenceSummary,
      details: {
        object_id: objectId,
        original_path: expectedPath,
        actual_path: actualPositions,
        deviation_meters: maxDeviation,
        deviation_point: deviationPoint,
        probable_cause: probableCause,
      },
    });

    const redirectionId = await persistence.createRouteRedirection({
      object_id: objectId,
      inference_id: inferenceId,
      original_path: expectedPath.map((p) => ({ ...p, timestamp: new Date().toISOString() })),
      actual_path: actualPositions,
      deviation_meters: maxDeviation,
      deviation_point: deviationPoint,
      probable_cause: probableCause,
    });

    logger.info("Route redirection detected", {
      object_id: objectId,
      deviation_meters: maxDeviation,
    });

    return {
      detected: true,
      redirectionId,
      objectId,
      deviationMeters: maxDeviation,
      deviationPoint,
      probableCause,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Route redirection detection failed", { error: message });
    return { detected: false, error: message };
  }
}

export async function detectHoldingPattern(
  persistence: PostgresPersistenceGateway,
  logger: Logger,
  objectId: string,
  positions: Array<{ lat: number; lon: number; heading_deg?: number; timestamp: string }>,
  minLoops: number = 2,
  _orbitRadiusThresholdMeters: number = 5000,
): Promise<HoldingPatternResult> {
  try {
    if (positions.length < 10) {
      return { detected: false };
    }

    const centerLat = positions.reduce((sum, p) => sum + p.lat, 0) / positions.length;
    const centerLon = positions.reduce((sum, p) => sum + p.lon, 0) / positions.length;

    const distances = positions.map((p) => calculateDistance(centerLat, centerLon, p.lat, p.lon));
    const avgRadius = distances.reduce((sum, d) => sum + d, 0) / distances.length;

    if (avgRadius < 100) {
      return { detected: false };
    }

    let crossings = 0;
    for (let i = 0; i < positions.length - 1; i++) {
      const p1 = positions[i];
      const p2 = positions[i + 1];
      const d1 = calculateDistance(centerLat, centerLon, p1.lat, p1.lon);
      const d2 = calculateDistance(centerLat, centerLon, p2.lat, p2.lon);
      if ((d1 < avgRadius && d2 >= avgRadius) || (d1 >= avgRadius && d2 < avgRadius)) {
        crossings++;
      }
    }
    const loopCount = Math.floor(crossings / 2);

    if (loopCount < minLoops) {
      return { detected: false };
    }

    const startTime = new Date(positions[0].timestamp);
    const endTime = new Date(positions[positions.length - 1].timestamp);
    const durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;

    const headings = positions
      .filter(
        (p): p is { lat: number; lon: number; heading_deg: number; timestamp: string } =>
          p.heading_deg !== undefined,
      )
      .map((p) => p.heading_deg);
    let headingChanges = 0;
    for (let i = 0; i < headings.length - 1; i++) {
      let diff = Math.abs(headings[i + 1] - headings[i]);
      if (diff > 180) diff = 360 - diff;
      headingChanges += diff;
    }

    const orbitType =
      avgRadius < 1000 ? "tight_orbit" : avgRadius < 3000 ? "standard_holding" : "wide_orbit";

    const confidence = Math.min(0.95, 0.3 + loopCount * 0.15 + (durationSeconds / 3600) * 0.2);

    const evidenceSummary = `Holding pattern detected for ${objectId}: ${loopCount} orbit loops (${durationSeconds.toFixed(0)}s) near (${centerLat.toFixed(4)}, ${centerLon.toFixed(4)})`;

    const inferenceId = await persistence.createInferredEvent({
      inference_type: "holding_pattern",
      confidence,
      confidence_level:
        confidence >= 0.9
          ? "very_high"
          : confidence >= 0.7
            ? "high"
            : confidence >= 0.5
              ? "medium"
              : "low",
      time_window_start: positions[0].timestamp,
      time_window_end: positions[positions.length - 1].timestamp,
      related_object_ids: [objectId],
      evidence_summary: evidenceSummary,
      details: {
        object_id: objectId,
        center_point: { lat: centerLat, lon: centerLon },
        radius_meters: avgRadius,
        loop_count: loopCount,
        duration_seconds: durationSeconds,
        orbit_type: orbitType,
        heading_changes: headingChanges,
      },
    });

    const patternId = await persistence.createHoldingPattern({
      object_id: objectId,
      inference_id: inferenceId,
      center_point: { lat: centerLat, lon: centerLon },
      radius_meters: avgRadius,
      loop_count: loopCount,
      duration_seconds: durationSeconds,
      orbit_type: orbitType,
      heading_changes: headingChanges,
    });

    logger.info("Holding pattern detected", {
      object_id: objectId,
      loop_count: loopCount,
      duration_seconds: durationSeconds,
    });

    return {
      detected: true,
      patternId,
      objectId,
      centerPoint: { lat: centerLat, lon: centerLon },
      radiusMeters: avgRadius,
      loopCount,
      durationSeconds,
      orbitType,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Holding pattern detection failed", { error: message });
    return { detected: false, error: message };
  }
}

export async function detectAbsenceSignal(
  persistence: PostgresPersistenceGateway,
  logger: Logger,
  layerId: string,
  timeWindowMinutes: number = 30,
  expectedMinCount: number = 5,
): Promise<AbsenceSignalResult> {
  try {
    const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000).toISOString();

    let observedCount = 0;
    const expectedCount = expectedMinCount;

    if (layerId === "flights") {
      const result = await persistence.getDatabase().pool.query(
        `
        SELECT COUNT(DISTINCT object_id) as count
        FROM latest_object_states
        WHERE updated_at > $1
      `,
        [cutoffTime],
      );
      observedCount = parseInt(result.rows[0]?.count ?? 0, 10);
    } else if (layerId === "earthquakes") {
      const result = await persistence.getDatabase().pool.query(
        `
        SELECT COUNT(*) as count
        FROM external_data_events
        WHERE layer_id = $1 AND observed_at > $2
      `,
        [layerId, cutoffTime],
      );
      observedCount = parseInt(result.rows[0]?.count ?? 0, 10);
    } else if (layerId === "bikeshare") {
      const result = await persistence.getDatabase().pool.query(
        `
        SELECT COUNT(*) as count
        FROM external_data_events
        WHERE layer_id = $1 AND observed_at > $2
      `,
        [layerId, cutoffTime],
      );
      observedCount = parseInt(result.rows[0]?.count ?? 0, 10);
    }

    const thinningPercent =
      expectedCount > 0 ? Math.max(0, ((expectedCount - observedCount) / expectedCount) * 100) : 0;

    if (observedCount >= expectedMinCount) {
      return { detected: false };
    }

    const sourceBlackout = observedCount === 0;
    const confidence = sourceBlackout
      ? 0.9
      : thinningPercent >= 50
        ? 0.7
        : thinningPercent >= 30
          ? 0.5
          : 0.3;

    const evidenceSummary = sourceBlackout
      ? `Source blackout detected for ${layerId}: 0 events in past ${timeWindowMinutes} minutes`
      : `Absence signal detected for ${layerId}: ${thinningPercent.toFixed(1)}% activity thinning (${observedCount}/${expectedCount})`;

    const inferenceId = await persistence.createInferredEvent({
      inference_type: "absence_signal",
      confidence,
      confidence_level:
        confidence >= 0.9
          ? "very_high"
          : confidence >= 0.7
            ? "high"
            : confidence >= 0.5
              ? "medium"
              : "low",
      time_window_start: cutoffTime,
      time_window_end: new Date().toISOString(),
      related_source_ids: [layerId],
      evidence_summary: evidenceSummary,
      details: {
        signal_type: layerId,
        affected_layer: layerId,
        thinning_percent: thinningPercent,
        expected_count: expectedCount,
        observed_count: observedCount,
        source_blackout: sourceBlackout,
      },
    });

    logger.info("Absence signal detected", {
      layer_id: layerId,
      thinning_percent: thinningPercent,
      observed_count: observedCount,
      expected_count: expectedCount,
    });

    return {
      detected: true,
      inferenceId,
      signalType: layerId,
      thinningPercent,
      expectedCount,
      observedCount,
      sourceBlackout,
      confidence,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Absence signal detection failed", { error: message });
    return { detected: false, error: message };
  }
}
