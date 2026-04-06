/**
 * Capture Service
 *
 * Handles source snapshotting for incident-linked capture jobs.
 * Each source type has specific logic for capturing current state.
 */

import type { Logger } from "../../../packages/logging/src/index.js";
import type { PostgresPersistenceGateway } from "../../../packages/persistence/src/index.js";

export interface SnapshotResult {
  success: boolean;
  snapshotCount: number;
  error?: string;
}

export interface CaptureContext {
  captureJobId: string;
  incidentId: string;
  sourceType: string;
  incidentStartAt: string;
  incidentEndAt: string;
}

const ADAPTER_VERSION = "1.0.0";

async function captureFlights(
  persistence: PostgresPersistenceGateway,
  ctx: CaptureContext,
  logger: Logger,
): Promise<SnapshotResult> {
  try {
    const result = await persistence.getDatabase().pool.query(
      `
        SELECT 
          object_id,
          state_version,
          as_of,
          status,
          attributes
        FROM latest_object_states
        WHERE last_event_id IN (
          SELECT event_id FROM canonical_events 
          WHERE object_id IN (
            SELECT object_id FROM tracked_objects 
            WHERE source_primary LIKE 'fixture%'
          )
        )
      `,
    );

    const snapshots: Array<{
      external_id: string | null;
      observed_at: string;
      payload: Record<string, unknown>;
    }> = [];

    for (const row of result.rows) {
      snapshots.push({
        external_id: row.object_id,
        observed_at: new Date(row.as_of).toISOString(),
        payload: {
          object_id: row.object_id,
          state_version: row.state_version,
          status: row.status,
          attributes: row.attributes,
        },
      });
    }

    for (const snap of snapshots) {
      await persistence.addCaptureSnapshot(
        ctx.captureJobId,
        ctx.sourceType,
        snap.external_id,
        snap.observed_at,
        snap.payload,
        {
          source_name: "Live Flights",
          record_count: snapshots.length,
          source_complete: true,
          raw_ref: null,
          adapter_version: ADAPTER_VERSION,
        },
      );
    }

    logger.info("Captured flight snapshots", {
      capture_job_id: ctx.captureJobId,
      count: snapshots.length,
    });

    return { success: true, snapshotCount: snapshots.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to capture flights", { capture_job_id: ctx.captureJobId, error: message });
    return { success: false, snapshotCount: 0, error: message };
  }
}

async function captureEarthquakes(
  persistence: PostgresPersistenceGateway,
  ctx: CaptureContext,
  logger: Logger,
): Promise<SnapshotResult> {
  try {
    const result = await persistence.getDatabase().pool.query(
      `
        SELECT 
          event_id,
          external_id,
          observed_at,
          payload
        FROM external_data_events
        WHERE layer_id = 'earthquakes'
          AND observed_at BETWEEN $1 AND $2
      `,
      [ctx.incidentStartAt, ctx.incidentEndAt],
    );

    for (const row of result.rows) {
      await persistence.addCaptureSnapshot(
        ctx.captureJobId,
        ctx.sourceType,
        row.external_id,
        new Date(row.observed_at).toISOString(),
        row.payload as Record<string, unknown>,
        {
          source_name: "USGS",
          record_count: result.rows.length,
          source_complete: true,
          raw_ref: row.event_id,
          adapter_version: ADAPTER_VERSION,
        },
      );
    }

    logger.info("Captured earthquake snapshots", {
      capture_job_id: ctx.captureJobId,
      count: result.rows.length,
    });

    return { success: true, snapshotCount: result.rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to capture earthquakes", {
      capture_job_id: ctx.captureJobId,
      error: message,
    });
    return { success: false, snapshotCount: 0, error: message };
  }
}

async function captureSatellites(
  persistence: PostgresPersistenceGateway,
  ctx: CaptureContext,
  logger: Logger,
): Promise<SnapshotResult> {
  try {
    const result = await persistence.getDatabase().pool.query(
      `
        SELECT 
          event_id,
          external_id,
          observed_at,
          payload
        FROM external_data_events
        WHERE layer_id = 'satellites'
          AND observed_at >= $1
        ORDER BY observed_at DESC
        LIMIT 500
      `,
      [ctx.incidentStartAt],
    );

    for (const row of result.rows) {
      await persistence.addCaptureSnapshot(
        ctx.captureJobId,
        ctx.sourceType,
        row.external_id,
        new Date(row.observed_at).toISOString(),
        row.payload as Record<string, unknown>,
        {
          source_name: "CelesTrak (NASA/DoD)",
          record_count: result.rows.length,
          source_complete: true,
          raw_ref: row.event_id,
          adapter_version: ADAPTER_VERSION,
        },
      );
    }

    logger.info("Captured satellite snapshots", {
      capture_job_id: ctx.captureJobId,
      count: result.rows.length,
    });

    return { success: true, snapshotCount: result.rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to capture satellites", {
      capture_job_id: ctx.captureJobId,
      error: message,
    });
    return { success: false, snapshotCount: 0, error: message };
  }
}

async function captureWeather(
  persistence: PostgresPersistenceGateway,
  ctx: CaptureContext,
  logger: Logger,
): Promise<SnapshotResult> {
  try {
    const result = await persistence.getDatabase().pool.query(
      `
        SELECT 
          event_id,
          external_id,
          observed_at,
          payload
        FROM external_data_events
        WHERE layer_id = 'weather'
          AND observed_at BETWEEN $1 AND $2
      `,
      [ctx.incidentStartAt, ctx.incidentEndAt],
    );

    for (const row of result.rows) {
      await persistence.addCaptureSnapshot(
        ctx.captureJobId,
        ctx.sourceType,
        row.external_id,
        new Date(row.observed_at).toISOString(),
        row.payload as Record<string, unknown>,
        {
          source_name: "NOAA/NWS",
          record_count: result.rows.length,
          source_complete: true,
          raw_ref: row.event_id,
          adapter_version: ADAPTER_VERSION,
        },
      );
    }

    logger.info("Captured weather snapshots", {
      capture_job_id: ctx.captureJobId,
      count: result.rows.length,
    });

    return { success: true, snapshotCount: result.rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to capture weather", { capture_job_id: ctx.captureJobId, error: message });
    return { success: false, snapshotCount: 0, error: message };
  }
}

async function captureBikeshare(
  persistence: PostgresPersistenceGateway,
  ctx: CaptureContext,
  logger: Logger,
): Promise<SnapshotResult> {
  try {
    const result = await persistence.getDatabase().pool.query(
      `
        SELECT 
          event_id,
          external_id,
          observed_at,
          payload
        FROM external_data_events
        WHERE layer_id = 'bikeshare'
          AND observed_at >= $1
        ORDER BY observed_at DESC
        LIMIT 200
      `,
      [ctx.incidentStartAt],
    );

    for (const row of result.rows) {
      await persistence.addCaptureSnapshot(
        ctx.captureJobId,
        ctx.sourceType,
        row.external_id,
        new Date(row.observed_at).toISOString(),
        row.payload as Record<string, unknown>,
        {
          source_name: "CityBikes",
          record_count: result.rows.length,
          source_complete: true,
          raw_ref: row.event_id,
          adapter_version: ADAPTER_VERSION,
        },
      );
    }

    logger.info("Captured bikeshare snapshots", {
      capture_job_id: ctx.captureJobId,
      count: result.rows.length,
    });

    return { success: true, snapshotCount: result.rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to capture bikeshare", {
      capture_job_id: ctx.captureJobId,
      error: message,
    });
    return { success: false, snapshotCount: 0, error: message };
  }
}

async function captureTraffic(
  persistence: PostgresPersistenceGateway,
  ctx: CaptureContext,
  logger: Logger,
): Promise<SnapshotResult> {
  try {
    const result = await persistence.getDatabase().pool.query(
      `
        SELECT 
          event_id,
          external_id,
          observed_at,
          payload
        FROM external_data_events
        WHERE layer_id = 'traffic'
          AND observed_at BETWEEN $1 AND $2
      `,
      [ctx.incidentStartAt, ctx.incidentEndAt],
    );

    for (const row of result.rows) {
      await persistence.addCaptureSnapshot(
        ctx.captureJobId,
        ctx.sourceType,
        row.external_id,
        new Date(row.observed_at).toISOString(),
        row.payload as Record<string, unknown>,
        {
          source_name: "TomTom/Google Maps",
          record_count: result.rows.length,
          source_complete: true,
          raw_ref: row.event_id,
          adapter_version: ADAPTER_VERSION,
        },
      );
    }

    logger.info("Captured traffic snapshots", {
      capture_job_id: ctx.captureJobId,
      count: result.rows.length,
    });

    return { success: true, snapshotCount: result.rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to capture traffic", { capture_job_id: ctx.captureJobId, error: message });
    return { success: false, snapshotCount: 0, error: message };
  }
}

async function captureAlerts(
  persistence: PostgresPersistenceGateway,
  ctx: CaptureContext,
  logger: Logger,
): Promise<SnapshotResult> {
  try {
    const result = await persistence.getDatabase().pool.query(
      `
        SELECT 
          alert_id,
          rule_id,
          severity,
          status,
          opened_at,
          closed_at,
          evidence_event_ids,
          evidence_object_ids,
          summary,
          explanation,
          confidence
        FROM alerts
        WHERE opened_at BETWEEN $1 AND $2
      `,
      [ctx.incidentStartAt, ctx.incidentEndAt],
    );

    for (const row of result.rows) {
      await persistence.addCaptureSnapshot(
        ctx.captureJobId,
        ctx.sourceType,
        row.alert_id,
        new Date(row.opened_at).toISOString(),
        {
          alert_id: row.alert_id,
          rule_id: row.rule_id,
          severity: row.severity,
          status: row.status,
          opened_at: row.opened_at,
          closed_at: row.closed_at,
          evidence_event_ids: row.evidence_event_ids,
          evidence_object_ids: row.evidence_object_ids,
          summary: row.summary,
          explanation: row.explanation,
          confidence: row.confidence,
        },
        {
          source_name: "Alerts",
          record_count: result.rows.length,
          source_complete: true,
          raw_ref: null,
          adapter_version: ADAPTER_VERSION,
        },
      );
    }

    logger.info("Captured alert snapshots", {
      capture_job_id: ctx.captureJobId,
      count: result.rows.length,
    });

    return { success: true, snapshotCount: result.rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to capture alerts", { capture_job_id: ctx.captureJobId, error: message });
    return { success: false, snapshotCount: 0, error: message };
  }
}

async function captureEvents(
  persistence: PostgresPersistenceGateway,
  ctx: CaptureContext,
  logger: Logger,
): Promise<SnapshotResult> {
  try {
    const result = await persistence.getDatabase().pool.query(
      `
        SELECT 
          event_id,
          event_type,
          object_id,
          source_id,
          observed_at,
          payload,
          geometry,
          altitude_m,
          heading_deg,
          speed_mps
        FROM canonical_events
        WHERE observed_at BETWEEN $1 AND $2
        ORDER BY observed_at ASC
        LIMIT 1000
      `,
      [ctx.incidentStartAt, ctx.incidentEndAt],
    );

    for (const row of result.rows) {
      await persistence.addCaptureSnapshot(
        ctx.captureJobId,
        ctx.sourceType,
        row.event_id,
        new Date(row.observed_at).toISOString(),
        {
          event_id: row.event_id,
          event_type: row.event_type,
          object_id: row.object_id,
          source_id: row.source_id,
          payload: row.payload,
          geometry: row.geometry,
          altitude_m: row.altitude_m,
          heading_deg: row.heading_deg,
          speed_mps: row.speed_mps,
        },
        {
          source_name: "Object Events",
          record_count: result.rows.length,
          source_complete: true,
          raw_ref: row.event_id,
          adapter_version: ADAPTER_VERSION,
        },
      );
    }

    logger.info("Captured event snapshots", {
      capture_job_id: ctx.captureJobId,
      count: result.rows.length,
    });

    return { success: true, snapshotCount: result.rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Failed to capture events", { capture_job_id: ctx.captureJobId, error: message });
    return { success: false, snapshotCount: 0, error: message };
  }
}

async function captureCCTV(
  _persistence: PostgresPersistenceGateway,
  ctx: CaptureContext,
  logger: Logger,
): Promise<SnapshotResult> {
  logger.info("CCTV capture skipped - snapshot only source", {
    capture_job_id: ctx.captureJobId,
  });
  return { success: true, snapshotCount: 0 };
}

export async function runCaptureJob(
  persistence: PostgresPersistenceGateway,
  captureJobId: string,
  logger: Logger,
): Promise<{ success: boolean; errorCode?: string; errorMessage?: string }> {
  const job = await persistence.getCaptureJob(captureJobId);
  if (!job) {
    return { success: false, errorCode: "NOT_FOUND", errorMessage: "Capture job not found" };
  }

  if (job.status !== "running") {
    return { success: false, errorCode: "INVALID_STATE", errorMessage: `Job is ${job.status}` };
  }

  const incident = await persistence.fetchIncident(job.incident_id);
  if (!incident) {
    return {
      success: false,
      errorCode: "INCIDENT_NOT_FOUND",
      errorMessage: "Linked incident not found",
    };
  }

  const ctx: CaptureContext = {
    captureJobId,
    incidentId: job.incident_id,
    sourceType: job.source_type,
    incidentStartAt: incident.start_at,
    incidentEndAt: incident.end_at,
  };

  let result: SnapshotResult;

  switch (job.source_type) {
    case "flights":
      result = await captureFlights(persistence, ctx, logger);
      break;
    case "earthquakes":
      result = await captureEarthquakes(persistence, ctx, logger);
      break;
    case "satellites":
      result = await captureSatellites(persistence, ctx, logger);
      break;
    case "weather":
      result = await captureWeather(persistence, ctx, logger);
      break;
    case "bikeshare":
      result = await captureBikeshare(persistence, ctx, logger);
      break;
    case "traffic":
      result = await captureTraffic(persistence, ctx, logger);
      break;
    case "alerts":
      result = await captureAlerts(persistence, ctx, logger);
      break;
    case "events":
      result = await captureEvents(persistence, ctx, logger);
      break;
    case "cctv":
      result = await captureCCTV(persistence, ctx, logger);
      break;
    default:
      result = {
        success: false,
        snapshotCount: 0,
        error: `Unknown source type: ${job.source_type}`,
      };
  }

  if (!result.success) {
    await persistence.completeCaptureJob(captureJobId, "CAPTURE_FAILED", result.error);
    return { success: false, errorCode: "CAPTURE_FAILED", errorMessage: result.error };
  }

  await persistence.completeCaptureJob(captureJobId);
  return { success: true };
}
