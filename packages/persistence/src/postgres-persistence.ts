import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  type CanonicalEvent,
  type CreateIncidentIntelligenceRunInput,
  type IncidentIntelligenceArtifact,
  type IncidentIntelligenceBundle,
  type IncidentIntelligenceRun,
  type IncidentWidgetManifest,
  OBJECT_STATE_SCHEMA_VERSION,
  type Source,
  type UpsertIncidentIntelligenceArtifactInput,
  type UpsertIncidentWidgetManifestInput,
} from "../../contracts/src/index.js";
import type { Geometry, ObjectState } from "../../contracts/src/models.js";
import { applyCanonicalEventToObjectState } from "../../domain/src/index.js";
import type {
  AuditLogInput,
  FixtureTelemetryIngestionPersistence,
  NormalizedAdapterRecord,
  PersistNormalizedRecordResult,
  RawPayloadReceipt,
} from "../../ingestion/src/index.js";
import type { ReplayQueryRepository, ReplayQueryRequest } from "../../replay/src/index.js";
import {
  coerceIsoTimestamp,
  createPostgresDatabase,
  type PostgresDatabase,
  withTransaction,
} from "./database.js";

let stateUpdateCallback: ((state: ObjectState) => void) | null = null;

export function setObjectStateUpdateCallback(
  callback: ((state: ObjectState) => void) | null,
): void {
  stateUpdateCallback = callback;
}

interface CanonicalEventRow {
  event_id: string;
  event_type: CanonicalEvent["event_type"];
  object_id: string;
  source_id: string;
  observed_at: Date | string;
  ingested_at: Date | string;
  processed_at: Date | string;
  schema_version: string;
  payload: Record<string, unknown>;
  provenance: CanonicalEvent["provenance"];
  confidence: number;
  dedupe_key: string;
  geometry_geojson: string | null;
  altitude_m: number | null;
  heading_deg: number | null;
  speed_mps: number | null;
  related_object_ids: string[];
  parent_event_id: string | null;
  trace_id: string | null;
}

interface ObjectStateRow {
  object_id: string;
  state_version: string;
  as_of: Date | string;
  position_geojson: string | null;
  velocity: Record<string, unknown> | null;
  status: string | null;
  attributes: Record<string, unknown>;
  last_event_id: string;
}

interface IncidentIntelligenceArtifactRow {
  artifact_id: string;
  incident_id: string;
  dedupe_key: string;
  artifact_type: IncidentIntelligenceArtifact["artifact_type"];
  provider: string;
  title: string;
  summary: string;
  url: string;
  thumbnail_url: string | null;
  author: string | null;
  published_at: Date | string | null;
  captured_at: Date | string;
  lat: number | null;
  lon: number | null;
  verification_status: IncidentIntelligenceArtifact["verification_status"];
  confidence: number;
  source_urls: string[];
  metadata: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}

interface IncidentWidgetManifestRow {
  widget_id: string;
  incident_id: string;
  widget_key: string;
  widget_type: IncidentWidgetManifest["widget_type"];
  title: string;
  layout: IncidentWidgetManifest["layout"];
  priority: number;
  status: IncidentWidgetManifest["status"];
  generated_by: string;
  spec: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}

interface IncidentIntelligenceRunRow {
  run_id: string;
  incident_id: string;
  provider: string;
  run_type: IncidentIntelligenceRun["run_type"];
  status: IncidentIntelligenceRun["status"];
  started_at: Date | string;
  completed_at: Date | string | null;
  error_message: string | null;
  stats: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapGeometry(value: string | null): Geometry | undefined {
  if (!value) {
    return undefined;
  }

  return JSON.parse(value) as Geometry;
}

function mapCanonicalEventRow(row: CanonicalEventRow): CanonicalEvent {
  return {
    event_id: row.event_id,
    event_type: row.event_type,
    object_id: row.object_id,
    source_id: row.source_id,
    observed_at: coerceIsoTimestamp(row.observed_at),
    ingested_at: coerceIsoTimestamp(row.ingested_at),
    processed_at: coerceIsoTimestamp(row.processed_at),
    schema_version: row.schema_version,
    payload: row.payload,
    provenance: row.provenance,
    confidence: row.confidence,
    dedupe_key: row.dedupe_key,
    geometry: mapGeometry(row.geometry_geojson),
    altitude_m: row.altitude_m,
    heading_deg: row.heading_deg,
    speed_mps: row.speed_mps,
    related_object_ids: row.related_object_ids,
    parent_event_id: row.parent_event_id,
    trace_id: row.trace_id,
  };
}

function mapObjectStateRow(row: ObjectStateRow): ObjectState {
  const pointGeometry = mapGeometry(row.position_geojson);
  const velocity = row.velocity ?? null;

  return {
    object_id: row.object_id,
    state_version: row.state_version,
    as_of: coerceIsoTimestamp(row.as_of),
    position:
      pointGeometry && pointGeometry.type === "Point"
        ? {
            lat: pointGeometry.coordinates[1],
            lon: pointGeometry.coordinates[0],
            altitude_m: pointGeometry.coordinates.length > 2 ? pointGeometry.coordinates[2] : null,
            geometry: pointGeometry,
          }
        : null,
    velocity: velocity
      ? {
          speed_mps: typeof velocity.speed_mps === "number" ? velocity.speed_mps : null,
          heading_deg: typeof velocity.heading_deg === "number" ? velocity.heading_deg : null,
        }
      : null,
    status: row.status,
    attributes: row.attributes,
    last_event_id: row.last_event_id,
  };
}

function mapIncidentIntelligenceArtifactRow(
  row: IncidentIntelligenceArtifactRow,
): IncidentIntelligenceArtifact {
  return {
    ...row,
    published_at: row.published_at ? coerceIsoTimestamp(row.published_at) : null,
    captured_at: coerceIsoTimestamp(row.captured_at),
    created_at: coerceIsoTimestamp(row.created_at),
    updated_at: coerceIsoTimestamp(row.updated_at),
    source_urls: row.source_urls ?? [],
    metadata: row.metadata ?? {},
  };
}

function mapIncidentWidgetManifestRow(row: IncidentWidgetManifestRow): IncidentWidgetManifest {
  return {
    ...row,
    spec: row.spec ?? {},
    created_at: coerceIsoTimestamp(row.created_at),
    updated_at: coerceIsoTimestamp(row.updated_at),
  };
}

function mapIncidentIntelligenceRunRow(row: IncidentIntelligenceRunRow): IncidentIntelligenceRun {
  return {
    ...row,
    started_at: coerceIsoTimestamp(row.started_at),
    completed_at: row.completed_at ? coerceIsoTimestamp(row.completed_at) : null,
    created_at: coerceIsoTimestamp(row.created_at),
    updated_at: coerceIsoTimestamp(row.updated_at),
    stats: row.stats ?? {},
  };
}

function pointGeometryJson(state: ObjectState): string | null {
  if (state.position?.geometry?.type === "Point") {
    return JSON.stringify(state.position.geometry);
  }

  if (!state.position) {
    return null;
  }

  return JSON.stringify({
    type: "Point",
    coordinates: [state.position.lon, state.position.lat],
  });
}

async function insertAuditLogWithClient(client: PoolClient, input: AuditLogInput): Promise<void> {
  await client.query(
    `
      INSERT INTO audit_logs (
        actor_id,
        actor_type,
        operation,
        target_type,
        target_id,
        trace_id,
        occurred_at,
        result,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    `,
    [
      input.actor_id,
      input.actor_type,
      input.operation,
      input.target_type,
      input.target_id,
      input.trace_id,
      input.occurred_at,
      input.result,
      JSON.stringify(input.metadata),
    ],
  );
}

async function loadCurrentObjectState(
  client: PoolClient,
  objectId: string,
): Promise<ObjectState | null> {
  const result = await client.query<ObjectStateRow>(
    `
      SELECT
        object_id,
        state_version,
        as_of,
        ST_AsGeoJSON(position) AS position_geojson,
        velocity,
        status,
        attributes,
        last_event_id
      FROM latest_object_states
      WHERE object_id = $1
    `,
    [objectId],
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapObjectStateRow(result.rows[0]);
}

async function upsertTrackedObject(
  client: PoolClient,
  input: { normalized_record: NormalizedAdapterRecord; source_id: string },
): Promise<void> {
  const event = input.normalized_record.canonical_event;
  const trackedObject = input.normalized_record.tracked_object;

  await client.query(
    `
      INSERT INTO tracked_objects (
        object_id,
        object_type,
        display_name,
        source_primary,
        latest_state_ref,
        created_at,
        updated_at,
        tags
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[])
      ON CONFLICT (object_id) DO UPDATE SET
        object_type = EXCLUDED.object_type,
        display_name = EXCLUDED.display_name,
        source_primary = EXCLUDED.source_primary,
        updated_at = EXCLUDED.updated_at,
        tags = EXCLUDED.tags
    `,
    [
      trackedObject.object_id,
      trackedObject.object_type,
      trackedObject.display_name,
      input.source_id,
      `state:${trackedObject.object_id}`,
      event.observed_at,
      event.processed_at,
      trackedObject.tags,
    ],
  );
}

async function insertCanonicalEvent(client: PoolClient, event: CanonicalEvent): Promise<boolean> {
  const result = await client.query(
    `
      INSERT INTO canonical_events (
        event_id,
        event_type,
        object_id,
        source_id,
        observed_at,
        ingested_at,
        processed_at,
        schema_version,
        payload,
        provenance,
        confidence,
        dedupe_key,
        geometry,
        altitude_m,
        heading_deg,
        speed_mps,
        related_object_ids,
        parent_event_id,
        trace_id
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9::jsonb,
        $10::jsonb,
        $11,
        $12,
        CASE
          WHEN $13::jsonb IS NULL THEN NULL
          ELSE ST_SetSRID(ST_GeomFromGeoJSON(($13::jsonb)::text), 4326)
        END,
        $14,
        $15,
        $16,
        $17::text[],
        $18,
        $19
      )
      ON CONFLICT (source_id, dedupe_key) DO NOTHING
      RETURNING event_id
    `,
    [
      event.event_id,
      event.event_type,
      event.object_id,
      event.source_id,
      event.observed_at,
      event.ingested_at,
      event.processed_at,
      event.schema_version,
      JSON.stringify(event.payload),
      JSON.stringify(event.provenance),
      event.confidence,
      event.dedupe_key,
      event.geometry ? JSON.stringify(event.geometry) : null,
      event.altitude_m,
      event.heading_deg,
      event.speed_mps,
      event.related_object_ids ?? [],
      event.parent_event_id,
      event.trace_id,
    ],
  );

  return result.rows.length > 0;
}

async function upsertLatestObjectState(client: PoolClient, state: ObjectState): Promise<void> {
  await client.query(
    `
      INSERT INTO latest_object_states (
        object_id,
        state_version,
        as_of,
        position,
        velocity,
        status,
        attributes,
        last_event_id
      )
      VALUES (
        $1,
        $2,
        $3,
        CASE
          WHEN $4::jsonb IS NULL THEN NULL
          ELSE ST_SetSRID(ST_GeomFromGeoJSON(($4::jsonb)::text), 4326)::geometry(Point, 4326)
        END,
        $5::jsonb,
        $6,
        $7::jsonb,
        $8
      )
      ON CONFLICT (object_id) DO UPDATE SET
        state_version = EXCLUDED.state_version,
        as_of = EXCLUDED.as_of,
        position = EXCLUDED.position,
        velocity = EXCLUDED.velocity,
        status = EXCLUDED.status,
        attributes = EXCLUDED.attributes,
        last_event_id = EXCLUDED.last_event_id,
        updated_at = NOW()
    `,
    [
      state.object_id,
      state.state_version,
      state.as_of,
      pointGeometryJson(state),
      state.velocity ? JSON.stringify(state.velocity) : null,
      state.status,
      JSON.stringify(state.attributes),
      state.last_event_id,
    ],
  );

  await client.query(
    `
      UPDATE tracked_objects
      SET latest_state_ref = $2, updated_at = NOW()
      WHERE object_id = $1
    `,
    [state.object_id, `state:${state.object_id}`],
  );
}

export class PostgresPersistenceGateway
  implements FixtureTelemetryIngestionPersistence, ReplayQueryRepository
{
  constructor(private readonly database: PostgresDatabase) {}

  static fromConnectionString(connectionString: string): PostgresPersistenceGateway {
    return new PostgresPersistenceGateway(
      createPostgresDatabase({ connection_string: connectionString }),
    );
  }

  getDatabase(): PostgresDatabase {
    return this.database;
  }

  async close(): Promise<void> {
    await this.database.close();
  }

  async ping(): Promise<void> {
    await this.database.ping();
  }

  async upsertSource(source: Source): Promise<void> {
    await this.database.pool.query(
      `
        INSERT INTO sources (
          source_id,
          source_type,
          name,
          status,
          owner,
          auth_ref,
          polling_mode,
          schema_version,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (source_id) DO UPDATE SET
          source_type = EXCLUDED.source_type,
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          owner = EXCLUDED.owner,
          auth_ref = EXCLUDED.auth_ref,
          polling_mode = EXCLUDED.polling_mode,
          schema_version = EXCLUDED.schema_version,
          updated_at = EXCLUDED.updated_at
      `,
      [
        source.source_id,
        source.source_type,
        source.name,
        source.status,
        source.owner,
        source.auth_ref,
        source.polling_mode,
        source.schema_version,
        source.created_at,
        source.updated_at,
      ],
    );
  }

  async createRawPayloadReceipt(input: {
    source_id: string;
    payload: Record<string, unknown>;
    adapter_version: string;
    trace_id: string;
    received_at: string;
  }): Promise<RawPayloadReceipt> {
    const rawPayloadId = `raw_${randomUUID()}`;
    const contentHash = createHash("sha256").update(JSON.stringify(input.payload)).digest("hex");

    await this.database.pool.query(
      `
        INSERT INTO raw_payloads (
          raw_payload_id,
          source_id,
          received_at,
          content_hash,
          parse_status,
          adapter_version,
          trace_id,
          payload
        )
        VALUES ($1, $2, $3, $4, 'received', $5, $6, $7::jsonb)
      `,
      [
        rawPayloadId,
        input.source_id,
        input.received_at,
        contentHash,
        input.adapter_version,
        input.trace_id,
        JSON.stringify(input.payload),
      ],
    );

    return {
      raw_payload_id: rawPayloadId,
      received_at: input.received_at,
      content_hash: contentHash,
    };
  }

  async markRawPayloadParsed(input: { raw_payload_id: string }): Promise<void> {
    await this.database.pool.query(
      `
        UPDATE raw_payloads
        SET parse_status = 'parsed'
        WHERE raw_payload_id = $1
      `,
      [input.raw_payload_id],
    );
  }

  async markRawPayloadQuarantined(input: {
    raw_payload_id: string;
    failure_code: string;
    failure_reason: string;
  }): Promise<void> {
    await this.database.pool.query(
      `
        UPDATE raw_payloads
        SET
          parse_status = 'quarantined',
          failure_code = $2,
          failure_reason = $3
        WHERE raw_payload_id = $1
      `,
      [input.raw_payload_id, input.failure_code, input.failure_reason],
    );
  }

  async recordAuditLog(input: AuditLogInput): Promise<void> {
    await this.database.pool.query(
      `
        INSERT INTO audit_logs (
          actor_id,
          actor_type,
          operation,
          target_type,
          target_id,
          trace_id,
          occurred_at,
          result,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      `,
      [
        input.actor_id,
        input.actor_type,
        input.operation,
        input.target_type,
        input.target_id,
        input.trace_id,
        input.occurred_at,
        input.result,
        JSON.stringify(input.metadata),
      ],
    );
  }

  async persistNormalizedRecord(input: {
    normalized_record: NormalizedAdapterRecord;
    trace_id: string;
  }): Promise<PersistNormalizedRecordResult> {
    return withTransaction(this.database, async (client) => {
      await upsertTrackedObject(client, {
        normalized_record: input.normalized_record,
        source_id: input.normalized_record.canonical_event.source_id,
      });

      const inserted = await insertCanonicalEvent(client, input.normalized_record.canonical_event);

      if (!inserted) {
        await insertAuditLogWithClient(client, {
          actor_id: null,
          actor_type: "system",
          operation: "canonical_event_duplicate_suppressed",
          target_type: "canonical_event",
          target_id: input.normalized_record.canonical_event.event_id,
          trace_id: input.trace_id,
          occurred_at: input.normalized_record.canonical_event.processed_at,
          result: "duplicate",
          metadata: {
            dedupe_key: input.normalized_record.canonical_event.dedupe_key,
            object_id: input.normalized_record.canonical_event.object_id,
          },
        });

        return {
          status: "duplicate",
          latest_state: null,
        };
      }

      const currentState = await loadCurrentObjectState(
        client,
        input.normalized_record.canonical_event.object_id,
      );
      const nextState = applyCanonicalEventToObjectState(
        currentState,
        input.normalized_record.canonical_event,
      );
      nextState.state_version = OBJECT_STATE_SCHEMA_VERSION;

      await upsertLatestObjectState(client, nextState);

      if (stateUpdateCallback) {
        stateUpdateCallback(nextState);
      }

      await insertAuditLogWithClient(client, {
        actor_id: null,
        actor_type: "system",
        operation: "canonical_event_persisted",
        target_type: "canonical_event",
        target_id: input.normalized_record.canonical_event.event_id,
        trace_id: input.trace_id,
        occurred_at: input.normalized_record.canonical_event.processed_at,
        result: "inserted",
        metadata: {
          object_id: input.normalized_record.canonical_event.object_id,
          source_id: input.normalized_record.canonical_event.source_id,
        },
      });

      return {
        status: "inserted",
        latest_state: nextState,
      };
    });
  }

  async fetchCanonicalEvents(input: ReplayQueryRequest): Promise<CanonicalEvent[]> {
    const result = await this.database.pool.query<CanonicalEventRow>(
      `
        SELECT
          event_id,
          event_type,
          object_id,
          source_id,
          observed_at,
          ingested_at,
          processed_at,
          schema_version,
          payload,
          provenance,
          confidence,
          dedupe_key,
          ST_AsGeoJSON(geometry) AS geometry_geojson,
          altitude_m,
          heading_deg,
          speed_mps,
          related_object_ids,
          parent_event_id,
          trace_id
        FROM canonical_events
        WHERE observed_at >= $1
          AND observed_at <= $2
          AND ($3::text IS NULL OR object_id = $3)
        ORDER BY observed_at ASC, ingested_at ASC, event_id ASC
      `,
      [input.start_at, input.end_at, input.object_id ?? null],
    );

    return result.rows.map(mapCanonicalEventRow);
  }

  async countTableRows(tableName: string): Promise<number> {
    const result = await this.database.pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM ${tableName}`,
    );

    return Number.parseInt(result.rows[0]?.count ?? "0", 10);
  }

  async upsertSourceHealth(input: {
    source_id: string;
    status: "active" | "inactive" | "stale" | "error";
    last_seen_at: string;
    error_message?: string;
  }): Promise<void> {
    await this.database.pool.query(
      `
        INSERT INTO source_health (
          source_id,
          status,
          last_seen_at,
          error_message,
          updated_at
        )
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (source_id) DO UPDATE SET
          status = EXCLUDED.status,
          last_seen_at = EXCLUDED.last_seen_at,
          error_message = EXCLUDED.error_message,
          updated_at = NOW()
      `,
      [input.source_id, input.status, input.last_seen_at, input.error_message ?? null],
    );
  }

  async fetchSourceHealth(sourceId: string): Promise<{
    source_id: string;
    status: string;
    last_seen_at: string;
    error_message: string | null;
    updated_at: string;
  } | null> {
    const result = await this.database.pool.query(
      `
        SELECT source_id, status, last_seen_at, error_message, updated_at
        FROM source_health
        WHERE source_id = $1
      `,
      [sourceId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      source_id: row.source_id,
      status: row.status,
      last_seen_at: row.last_seen_at,
      error_message: row.error_message,
      updated_at: row.updated_at,
    };
  }

  async fetchAllSourceHealth(): Promise<
    Array<{
      source_id: string;
      status: string;
      last_seen_at: string;
      error_message: string | null;
      updated_at: string;
    }>
  > {
    const result = await this.database.pool.query(
      `
        SELECT source_id, status, last_seen_at, error_message, updated_at
        FROM source_health
        ORDER BY source_id ASC
      `,
    );

    return result.rows;
  }

  async fetchLatestStateForAllObjects(): Promise<ObjectState[]> {
    const result = await this.database.pool.query<ObjectStateRow>(
      `
        SELECT
          object_id,
          state_version,
          as_of,
          ST_AsGeoJSON(position) AS position_geojson,
          velocity,
          status,
          attributes,
          last_event_id
        FROM latest_object_states
        ORDER BY as_of DESC
      `,
    );

    return result.rows.map(mapObjectStateRow);
  }

  async fetchRecentTrackForObject(
    objectId: string,
    limit: number,
  ): Promise<
    Array<{
      lat: number;
      lon: number;
      altitude_m: number | null;
      observed_at: string;
      speed_mps: number | null;
      heading_deg: number | null;
    }>
  > {
    const result = await this.database.pool.query<{
      lat: number;
      lon: number;
      altitude_m: number | null;
      observed_at: string;
      speed_mps: number | null;
      heading_deg: number | null;
    }>(
      `
        SELECT
          ST_Y(geometry) AS lat,
          ST_X(geometry) AS lon,
          altitude_m,
          observed_at,
          speed_mps,
          heading_deg
        FROM canonical_events
        WHERE object_id = $1
          AND geometry IS NOT NULL
        ORDER BY observed_at DESC
        LIMIT $2
      `,
      [objectId, limit],
    );

    return result.rows
      .map((row) => ({
        lat: row.lat,
        lon: row.lon,
        altitude_m: row.altitude_m,
        observed_at: new Date(row.observed_at).toISOString(),
        speed_mps: row.speed_mps,
        heading_deg: row.heading_deg,
      }))
      .reverse();
  }

  async persistAlert(input: {
    alert_id: string;
    rule_id: string;
    severity: string;
    evidence_event_ids: string[];
    evidence_object_ids: string[];
    summary: string;
    explanation: string;
    confidence: number;
  }): Promise<void> {
    await this.database.pool.query(
      `
        INSERT INTO alerts (
          alert_id,
          rule_id,
          severity,
          status,
          opened_at,
          updated_at,
          closed_at,
          acknowledged_at,
          acknowledged_by,
          schema_version,
          evidence_event_ids,
          evidence_object_ids,
          summary,
          explanation,
          confidence
        )
        VALUES ($1, $2, $3, 'open', NOW(), NOW(), NULL, NULL, NULL, $4, $5::text[], $6::text[], $7, $8, $9)
        ON CONFLICT (alert_id) DO NOTHING
      `,
      [
        input.alert_id,
        input.rule_id,
        input.severity,
        "1.0.0",
        input.evidence_event_ids,
        input.evidence_object_ids,
        input.summary,
        input.explanation,
        input.confidence,
      ],
    );
  }

  async fetchAlerts(input?: {
    status?: string;
    severity?: string;
    object_id?: string;
    limit?: number;
  }): Promise<
    Array<{
      alert_id: string;
      rule_id: string;
      severity: string;
      status: string;
      opened_at: string;
      updated_at: string;
      closed_at: string | null;
      acknowledged_at: string | null;
      acknowledged_by: string | null;
      schema_version: string;
      evidence_event_ids: string[];
      evidence_object_ids: string[];
      summary: string;
      explanation: string;
      confidence: number;
    }>
  > {
    let query = "SELECT * FROM alerts WHERE 1=1";
    const params: unknown[] = [];
    let paramIndex = 1;

    if (input?.status) {
      const statusList = input.status.split(",").map((s) => s.trim());
      if (statusList.length === 1) {
        query += ` AND status = $${paramIndex}`;
        params.push(statusList[0]);
        paramIndex++;
      } else {
        const placeholders = statusList.map(() => `$${paramIndex++}`).join(", ");
        query += ` AND status IN (${placeholders})`;
        params.push(...statusList);
      }
    }

    if (input?.severity) {
      query += ` AND severity = $${paramIndex}`;
      params.push(input.severity);
      paramIndex++;
    }

    if (input?.object_id) {
      query += ` AND $${paramIndex} = ANY(evidence_object_ids)`;
      params.push(input.object_id);
      paramIndex++;
    }

    query += " ORDER BY opened_at DESC";

    if (input?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(input.limit);
    }

    const result = await this.database.pool.query(query, params);
    return result.rows;
  }

  async fetchAlert(alertId: string): Promise<{
    alert_id: string;
    rule_id: string;
    severity: string;
    status: string;
    opened_at: string;
    updated_at: string;
    closed_at: string | null;
    acknowledged_at: string | null;
    acknowledged_by: string | null;
    schema_version: string;
    evidence_event_ids: string[];
    evidence_object_ids: string[];
    summary: string;
    explanation: string;
    confidence: number;
  } | null> {
    const result = await this.database.pool.query("SELECT * FROM alerts WHERE alert_id = $1", [
      alertId,
    ]);

    return result.rows[0] ?? null;
  }

  async updateAlertStatus(input: {
    alert_id: string;
    status: string;
    acknowledged_by?: string;
  }): Promise<void> {
    const updates = ["status = $2", "updated_at = NOW()"];
    const params: unknown[] = [input.alert_id, input.status];

    if (input.status === "acknowledged") {
      updates.push("acknowledged_at = NOW()");
      if (input.acknowledged_by) {
        updates.push("acknowledged_by = $3");
        params.push(input.acknowledged_by);
      }
    }

    if (input.status === "closed") {
      updates.push("closed_at = NOW()");
    }

    await this.database.pool.query(
      `UPDATE alerts SET ${updates.join(", ")} WHERE alert_id = $1`,
      params,
    );
  }

  // ============ EXTERNAL DATA LAYER METHODS ============

  async fetchExternalDataLayers(): Promise<
    Array<{
      layer_id: string;
      source_name: string;
      source_url: string | null;
      license: string;
      update_cadence_seconds: number;
      last_fetch_at: string | null;
      status: string;
      record_count: number;
      error_message: string | null;
    }>
  > {
    const result = await this.database.pool.query(
      `
        SELECT 
          layer_id,
          source_name,
          source_url,
          license,
          update_cadence_seconds,
          last_fetch_at,
          status,
          record_count,
          error_message
        FROM external_data_layers
        ORDER BY layer_id ASC
      `,
    );

    return result.rows.map((row) => ({
      ...row,
      last_fetch_at: row.last_fetch_at ? new Date(row.last_fetch_at).toISOString() : null,
    }));
  }

  async fetchExternalDataLayer(layerId: string): Promise<{
    layer_id: string;
    source_name: string;
    source_url: string | null;
    license: string;
    update_cadence_seconds: number;
    last_fetch_at: string | null;
    status: string;
    record_count: number;
    error_message: string | null;
    raw_data: Record<string, unknown> | null;
  } | null> {
    const result = await this.database.pool.query(
      `
        SELECT 
          layer_id,
          source_name,
          source_url,
          license,
          update_cadence_seconds,
          last_fetch_at,
          status,
          record_count,
          error_message,
          raw_data
        FROM external_data_layers
        WHERE layer_id = $1
      `,
      [layerId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      ...row,
      last_fetch_at: row.last_fetch_at ? new Date(row.last_fetch_at).toISOString() : null,
      raw_data: row.raw_data ?? null,
    };
  }

  async updateExternalDataLayer(input: {
    layer_id: string;
    status: string;
    record_count: number;
    error_message?: string;
    raw_data?: Record<string, unknown>;
  }): Promise<void> {
    await this.database.pool.query(
      `
        UPDATE external_data_layers
        SET 
          status = $2,
          record_count = $3,
          error_message = $4,
          raw_data = $5::jsonb,
          last_fetch_at = NOW(),
          updated_at = NOW()
        WHERE layer_id = $1
      `,
      [
        input.layer_id,
        input.status,
        input.record_count,
        input.error_message ?? null,
        input.raw_data ? JSON.stringify(input.raw_data) : null,
      ],
    );
  }

  async persistExternalDataEvents(
    layerId: string,
    events: Array<{
      event_id: string;
      external_id: string;
      event_type: string;
      observed_at: string;
      lat: number;
      lon: number;
      altitude_m?: number | null;
      payload: Record<string, unknown>;
    }>,
  ): Promise<void> {
    // Use batch insert for efficiency
    const client = await this.database.pool.connect();

    try {
      await client.query("BEGIN");

      // Clear old events for this layer (keep last 24 hours worth)
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await client.query(
        `
          DELETE FROM external_data_events
          WHERE layer_id = $1 AND observed_at < $2
        `,
        [layerId, cutoffTime],
      );

      // Insert new events
      for (const event of events) {
        const payload = {
          ...event.payload,
          altitude_m: event.altitude_m ?? null,
        };

        await client.query(
          `
            INSERT INTO external_data_events (
              event_id,
              layer_id,
              external_id,
              event_type,
              observed_at,
              geometry,
              payload
            )
            VALUES ($1, $2, $3, $4, $5, ST_SetSRID(ST_MakePoint($6, $7), 4326), $8::jsonb)
            ON CONFLICT (layer_id, external_id) DO UPDATE SET
              event_type = EXCLUDED.event_type,
              observed_at = EXCLUDED.observed_at,
              geometry = EXCLUDED.geometry,
              payload = EXCLUDED.payload
          `,
          [
            event.event_id,
            layerId,
            event.external_id,
            event.event_type,
            event.observed_at,
            event.lon,
            event.lat,
            JSON.stringify(payload),
          ],
        );
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async fetchExternalDataEvents(
    layerId: string,
    bounds?: {
      west: number;
      south: number;
      east: number;
      north: number;
    },
  ): Promise<
    Array<{
      event_id: string;
      layer_id: string;
      external_id: string;
      event_type: string;
      observed_at: string;
      lat: number;
      lon: number;
      altitude_m: number | null;
      payload: Record<string, unknown>;
    }>
  > {
    const params: unknown[] = [layerId];
    let boundsClause = "";

    if (bounds) {
      params.push(bounds.west, bounds.south, bounds.east, bounds.north);
      boundsClause = `
        AND ST_X(geometry) BETWEEN $2 AND $4
        AND ST_Y(geometry) BETWEEN $3 AND $5
      `;
    }

    const result = await this.database.pool.query(
      `
        SELECT 
          event_id,
          layer_id,
          external_id,
          event_type,
          observed_at,
          ST_Y(geometry) as lat,
          ST_X(geometry) as lon,
          payload
        FROM external_data_events
        WHERE layer_id = $1
          ${boundsClause}
        ORDER BY observed_at DESC
      `,
      params,
    );

    return result.rows.map((row) => ({
      ...row,
      observed_at: new Date(row.observed_at).toISOString(),
      altitude_m: typeof row.payload?.altitude_m === "number" ? row.payload.altitude_m : null,
      payload: row.payload ?? {},
    }));
  }

  async clearExternalDataEvents(layerId: string): Promise<void> {
    await this.database.pool.query(
      `
        DELETE FROM external_data_events
        WHERE layer_id = $1
      `,
      [layerId],
    );
  }

  // ============ INCIDENT METHODS ============

  async fetchIncidents(input?: { status?: string; severity?: string; limit?: number }): Promise<
    Array<{
      incident_id: string;
      title: string;
      description: string;
      start_at: string;
      end_at: string;
      aoi: Record<string, unknown> | null;
      status: string;
      severity: string;
      created_at: string;
      updated_at: string;
      created_by: string;
      tags: string[];
    }>
  > {
    let query = `
      SELECT 
        incident_id,
        title,
        description,
        start_at,
        end_at,
        CASE WHEN aoi IS NOT NULL THEN ST_AsGeoJSON(aoi)::jsonb ELSE NULL END as aoi,
        status,
        severity,
        created_at,
        updated_at,
        created_by,
        tags
      FROM incidents
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (input?.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(input.status);
      paramIndex++;
    }

    if (input?.severity) {
      query += ` AND severity = $${paramIndex}`;
      params.push(input.severity);
      paramIndex++;
    }

    query += " ORDER BY start_at DESC";

    if (input?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(input.limit);
    }

    const result = await this.database.pool.query(query, params);

    return result.rows.map((row) => ({
      ...row,
      start_at: new Date(row.start_at).toISOString(),
      end_at: new Date(row.end_at).toISOString(),
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    }));
  }

  async fetchIncident(incidentId: string): Promise<{
    incident_id: string;
    title: string;
    description: string;
    start_at: string;
    end_at: string;
    aoi: Record<string, unknown> | null;
    status: string;
    severity: string;
    created_at: string;
    updated_at: string;
    created_by: string;
    tags: string[];
  } | null> {
    const result = await this.database.pool.query(
      `
        SELECT 
          incident_id,
          title,
          description,
          start_at,
          end_at,
          CASE WHEN aoi IS NOT NULL THEN ST_AsGeoJSON(aoi)::jsonb ELSE NULL END as aoi,
          status,
          severity,
          created_at,
          updated_at,
          created_by,
          tags
        FROM incidents
        WHERE incident_id = $1
      `,
      [incidentId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      ...row,
      start_at: new Date(row.start_at).toISOString(),
      end_at: new Date(row.end_at).toISOString(),
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  }

  async createIncident(input: {
    incident_id: string;
    title: string;
    description?: string;
    start_at: string;
    end_at: string;
    aoi?: Record<string, unknown>;
    status: string;
    severity: string;
    created_by: string;
    tags?: string[];
  }): Promise<void> {
    await this.database.pool.query(
      `
        INSERT INTO incidents (
          incident_id,
          title,
          description,
          start_at,
          end_at,
          aoi,
          status,
          severity,
          created_by,
          tags
        )
        VALUES (
          $1, $2, $3, $4, $5,
          CASE
            WHEN $6::jsonb IS NULL THEN NULL
            ELSE ST_SetSRID(ST_GeomFromGeoJSON($6::jsonb::text), 4326)
          END,
          $7, $8, $9, $10
        )
      `,
      [
        input.incident_id,
        input.title,
        input.description ?? "",
        input.start_at,
        input.end_at,
        input.aoi ? JSON.stringify(input.aoi) : null,
        input.status,
        input.severity,
        input.created_by,
        input.tags ?? [],
      ],
    );
  }

  async updateIncident(input: {
    incident_id: string;
    title?: string;
    description?: string;
    start_at?: string;
    end_at?: string;
    aoi?: Record<string, unknown>;
    status?: string;
    severity?: string;
    tags?: string[];
  }): Promise<void> {
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (input.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      params.push(input.title);
    }
    if (input.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(input.description);
    }
    if (input.start_at !== undefined) {
      updates.push(`start_at = $${paramIndex++}`);
      params.push(input.start_at);
    }
    if (input.end_at !== undefined) {
      updates.push(`end_at = $${paramIndex++}`);
      params.push(input.end_at);
    }
    if (input.aoi !== undefined) {
      updates.push(
        `aoi = CASE WHEN $${paramIndex}::jsonb IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($${paramIndex}::jsonb::text), 4326) END`,
      );
      params.push(input.aoi ? JSON.stringify(input.aoi) : null);
      paramIndex++;
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(input.status);
    }
    if (input.severity !== undefined) {
      updates.push(`severity = $${paramIndex++}`);
      params.push(input.severity);
    }
    if (input.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      params.push(input.tags);
    }

    if (updates.length === 0) {
      return;
    }

    params.push(input.incident_id);

    await this.database.pool.query(
      `UPDATE incidents SET ${updates.join(", ")} WHERE incident_id = $${paramIndex}`,
      params,
    );
  }

  async fetchIncidentChapters(incidentId: string): Promise<
    Array<{
      chapter_id: string;
      incident_id: string;
      title: string;
      timestamp: string;
      description: string | null;
      event_ids: string[];
      alert_ids: string[];
      lat: number | null;
      lon: number | null;
      created_at: string;
    }>
  > {
    const result = await this.database.pool.query(
      `
        SELECT 
          chapter_id,
          incident_id,
          title,
          timestamp,
          description,
          event_ids,
          alert_ids,
          CASE WHEN position IS NOT NULL THEN ST_Y(position::geometry) ELSE NULL END as lat,
          CASE WHEN position IS NOT NULL THEN ST_X(position::geometry) ELSE NULL END as lon,
          created_at
        FROM incident_chapters
        WHERE incident_id = $1
        ORDER BY timestamp ASC
      `,
      [incidentId],
    );

    return result.rows.map((row) => ({
      ...row,
      timestamp: new Date(row.timestamp).toISOString(),
      created_at: new Date(row.created_at).toISOString(),
    }));
  }

  async createIncidentChapter(input: {
    chapter_id: string;
    incident_id: string;
    title: string;
    timestamp: string;
    description?: string;
    event_ids?: string[];
    alert_ids?: string[];
    lat?: number;
    lon?: number;
  }): Promise<void> {
    await this.database.pool.query(
      `
        INSERT INTO incident_chapters (
          chapter_id,
          incident_id,
          title,
          timestamp,
          description,
          event_ids,
          alert_ids,
          position
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 
          CASE WHEN $8 IS NOT NULL AND $9 IS NOT NULL 
          THEN ST_SetSRID(ST_MakePoint($9, $8), 4326)::geography 
          ELSE NULL END
        )
      `,
      [
        input.chapter_id,
        input.incident_id,
        input.title,
        input.timestamp,
        input.description ?? null,
        input.event_ids ?? [],
        input.alert_ids ?? [],
        input.lat ?? null,
        input.lon ?? null,
      ],
    );
  }

  async fetchIncidentLinks(incidentId: string): Promise<
    Array<{
      incident_id: string;
      event_id: string | null;
      alert_id: string | null;
      external_event_id: string | null;
      layer_id: string | null;
      linked_at: string;
      linked_by: string;
    }>
  > {
    const result = await this.database.pool.query(
      `
        SELECT 
          incident_id,
          event_id,
          alert_id,
          external_event_id,
          layer_id,
          linked_at,
          linked_by
        FROM incident_links
        WHERE incident_id = $1
      `,
      [incidentId],
    );

    return result.rows.map((row) => ({
      ...row,
      linked_at: new Date(row.linked_at).toISOString(),
    }));
  }

  async createIncidentLink(input: {
    incident_id: string;
    event_id?: string;
    alert_id?: string;
    external_event_id?: string;
    layer_id?: string;
    linked_by: string;
  }): Promise<void> {
    await this.database.pool.query(
      `
        INSERT INTO incident_links (
          incident_id,
          event_id,
          alert_id,
          external_event_id,
          layer_id,
          linked_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (incident_id, event_id, alert_id, external_event_id) DO NOTHING
      `,
      [
        input.incident_id,
        input.event_id ?? null,
        input.alert_id ?? null,
        input.external_event_id ?? null,
        input.layer_id ?? null,
        input.linked_by,
      ],
    );
  }

  async fetchIncidentTimeline(incidentId: string): Promise<{
    incident: {
      incident_id: string;
      title: string;
      description: string;
      start_at: string;
      end_at: string;
      status: string;
      severity: string;
    } | null;
    markers: Array<{
      marker_id: string;
      type: string;
      timestamp: string;
      title: string;
      description: string | null;
      severity: string | null;
      layer_id: string | null;
      event_id: string | null;
      alert_id: string | null;
      external_id: string | null;
      lat: number | null;
      lon: number | null;
      linked_chapter_id: string | null;
    }>;
    inferences: Array<{
      marker_id: string;
      inference_id: string;
      type: string;
      subtype: string;
      timestamp: string;
      title: string;
      description: string;
      confidence: number;
      confidence_level: string;
      severity: string;
      lat: number | null;
      lon: number | null;
    }>;
    chapters: Array<{
      chapter_id: string;
      title: string;
      timestamp: string;
      description: string | null;
      lat: number | null;
      lon: number | null;
    }>;
  } | null> {
    const incidentResult = await this.database.pool.query(
      `
        SELECT 
          incident_id,
          title,
          description,
          start_at,
          end_at,
          status,
          severity
        FROM incidents
        WHERE incident_id = $1
      `,
      [incidentId],
    );

    if (incidentResult.rows.length === 0) {
      return null;
    }

    const incident = incidentResult.rows[0];

    const markersResult = await this.database.pool.query(
      `
        SELECT DISTINCT ON (COALESCE(il.event_id, il.alert_id, il.external_event_id, ic.chapter_id))
          COALESCE(il.event_id, 'ext_' || il.external_event_id, 'alert_' || il.alert_id, 'chapter_' || ic.chapter_id) as marker_id,
          COALESCE(il.event_id, 'external') as type,
          COALESCE(ce.observed_at, ea.opened_at, eed.observed_at, ic.timestamp) as timestamp,
          COALESCE(ce.event_id, ea.alert_id, eed.event_id, ic.chapter_id) as source_id,
          CASE 
            WHEN il.event_id IS NOT NULL THEN 'object_event'
            WHEN il.alert_id IS NOT NULL THEN 'alert'
            WHEN il.external_event_id IS NOT NULL THEN il.layer_id
            ELSE 'chapter'
          END as marker_type,
          COALESCE(ce.event_type, ea.severity, eed.event_type, 'chapter') as title,
          COALESCE(ce.event_id, ea.summary, eed.event_id, ic.title) as description,
          ea.severity,
          il.layer_id,
          il.event_id,
          il.alert_id,
          il.external_event_id,
          COALESCE(
            ST_Y(ce.geometry),
            ST_Y(eed.geometry),
            ST_Y(ic.position::geometry)
          ) as lat,
          COALESCE(
            ST_X(ce.geometry),
            ST_X(eed.geometry),
            ST_X(ic.position::geometry)
          ) as lon,
          ic.chapter_id as linked_chapter_id
        FROM incident_links il
        LEFT JOIN canonical_events ce ON il.event_id = ce.event_id
        LEFT JOIN alerts ea ON il.alert_id = ea.alert_id
        LEFT JOIN external_data_events eed ON il.external_event_id = eed.event_id
        LEFT JOIN incident_chapters ic ON ic.incident_id = il.incident_id AND ic.timestamp BETWEEN 
          (SELECT start_at FROM incidents WHERE incident_id = $1) AND
          (SELECT end_at FROM incidents WHERE incident_id = $1)
        WHERE il.incident_id = $1
        ORDER BY COALESCE(il.event_id, il.alert_id, il.external_event_id, ic.chapter_id), timestamp ASC
      `,
      [incidentId],
    );

    const chaptersResult = await this.database.pool.query(
      `
        SELECT 
          chapter_id,
          title,
          timestamp,
          description,
          ST_Y(position::geometry) as lat,
          ST_X(position::geometry) as lon
        FROM incident_chapters
        WHERE incident_id = $1
        ORDER BY timestamp ASC
      `,
      [incidentId],
    );

    const inferenceMarkers = await this.listInferenceTimelineMarkers(incidentId);

    return {
      incident: {
        incident_id: incident.incident_id,
        title: incident.title,
        description: incident.description,
        start_at: new Date(incident.start_at).toISOString(),
        end_at: new Date(incident.end_at).toISOString(),
        status: incident.status,
        severity: incident.severity,
      },
      markers: markersResult.rows.map((row) => ({
        marker_id: row.marker_id,
        type: row.marker_type,
        timestamp: new Date(row.timestamp).toISOString(),
        title: row.title,
        description: row.description,
        severity: row.severity,
        layer_id: row.layer_id,
        event_id: row.event_id,
        alert_id: row.alert_id,
        external_id: row.external_event_id,
        lat: row.lat,
        lon: row.lon,
        linked_chapter_id: row.linked_chapter_id,
      })),
      inferences: inferenceMarkers,
      chapters: chaptersResult.rows.map((row) => ({
        chapter_id: row.chapter_id,
        title: row.title,
        timestamp: new Date(row.timestamp).toISOString(),
        description: row.description,
        lat: row.lat,
        lon: row.lon,
      })),
    };
  }

  async createCaptureJob(
    incidentId: string,
    sourceType: string,
    createdBy: string,
  ): Promise<string> {
    const captureJobId = `cap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    await this.database.pool.query(
      `
        INSERT INTO capture_jobs (
          capture_job_id,
          incident_id,
          source_type,
          status,
          created_by
        )
        VALUES ($1, $2, $3, 'pending', $4)
      `,
      [captureJobId, incidentId, sourceType, createdBy],
    );
    return captureJobId;
  }

  async getCaptureJob(captureJobId: string): Promise<{
    capture_job_id: string;
    incident_id: string;
    source_type: string;
    status: string;
    started_at: string | null;
    ended_at: string | null;
    snapshot_count: number;
    error_code: string | null;
    error_message: string | null;
    freeze_status: string;
    created_at: string;
    created_by: string;
  } | null> {
    const result = await this.database.pool.query(
      `
        SELECT 
          capture_job_id,
          incident_id,
          source_type,
          status,
          started_at,
          ended_at,
          snapshot_count,
          error_code,
          error_message,
          freeze_status,
          created_at,
          created_by
        FROM capture_jobs
        WHERE capture_job_id = $1
      `,
      [captureJobId],
    );
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0];
    return {
      ...row,
      started_at: row.started_at ? new Date(row.started_at).toISOString() : null,
      ended_at: row.ended_at ? new Date(row.ended_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  async listCaptureJobs(
    incidentId?: string,
    status?: string,
  ): Promise<
    Array<{
      capture_job_id: string;
      incident_id: string;
      source_type: string;
      status: string;
      started_at: string | null;
      ended_at: string | null;
      snapshot_count: number;
      freeze_status: string;
      created_at: string;
    }>
  > {
    let query = `
      SELECT 
        capture_job_id,
        incident_id,
        source_type,
        status,
        started_at,
        ended_at,
        snapshot_count,
        freeze_status,
        created_at
      FROM capture_jobs
    `;
    const params: string[] = [];
    const conditions: string[] = [];

    if (incidentId) {
      params.push(incidentId);
      conditions.push(`incident_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }
    query += " ORDER BY created_at DESC";

    const result = await this.database.pool.query(query, params);
    return result.rows.map((row) => ({
      ...row,
      started_at: row.started_at ? new Date(row.started_at).toISOString() : null,
      ended_at: row.ended_at ? new Date(row.ended_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
    }));
  }

  async startCaptureJob(captureJobId: string): Promise<void> {
    await this.database.pool.query(
      `
        UPDATE capture_jobs
        SET status = 'running', started_at = NOW()
        WHERE capture_job_id = $1 AND status = 'pending'
      `,
      [captureJobId],
    );
  }

  async completeCaptureJob(
    captureJobId: string,
    errorCode?: string,
    errorMessage?: string,
  ): Promise<void> {
    const status = errorCode ? "failed" : "completed";
    await this.database.pool.query(
      `
        UPDATE capture_jobs
        SET status = $1, ended_at = NOW(), error_code = $2, error_message = $3
        WHERE capture_job_id = $4
      `,
      [status, errorCode ?? null, errorMessage ?? null, captureJobId],
    );
  }

  async addCaptureSnapshot(
    captureJobId: string,
    sourceType: string,
    externalId: string | null,
    observedAt: string,
    payload: Record<string, unknown>,
    metadata: Record<string, unknown>,
  ): Promise<string> {
    const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    await this.database.pool.query(
      `
        INSERT INTO capture_snapshots (
          snapshot_id,
          capture_job_id,
          source_type,
          external_id,
          observed_at,
          payload,
          metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
      `,
      [
        snapshotId,
        captureJobId,
        sourceType,
        externalId,
        observedAt,
        JSON.stringify(payload),
        JSON.stringify(metadata),
      ],
    );
    return snapshotId;
  }

  async listCaptureSnapshots(captureJobId: string): Promise<
    Array<{
      snapshot_id: string;
      source_type: string;
      external_id: string | null;
      observed_at: string;
      captured_at: string;
      frozen: boolean;
      frozen_at: string | null;
    }>
  > {
    const result = await this.database.pool.query(
      `
        SELECT 
          snapshot_id,
          source_type,
          external_id,
          observed_at,
          captured_at,
          frozen,
          frozen_at
        FROM capture_snapshots
        WHERE capture_job_id = $1
        ORDER BY captured_at ASC
      `,
      [captureJobId],
    );
    return result.rows.map((row) => ({
      ...row,
      observed_at: new Date(row.observed_at).toISOString(),
      captured_at: new Date(row.captured_at).toISOString(),
      frozen_at: row.frozen_at ? new Date(row.frozen_at).toISOString() : null,
    }));
  }

  async freezeSnapshots(captureJobId: string): Promise<number> {
    const result = await this.database.pool.query(
      `
        UPDATE capture_snapshots
        SET frozen = TRUE, frozen_at = NOW()
        WHERE capture_job_id = $1 AND frozen = FALSE
      `,
      [captureJobId],
    );
    return result.rowCount ?? 0;
  }

  async updateCaptureJobFreezeStatus(captureJobId: string, freezeStatus: string): Promise<void> {
    await this.database.pool.query(
      `
        UPDATE capture_jobs
        SET freeze_status = $1
        WHERE capture_job_id = $2
      `,
      [freezeStatus, captureJobId],
    );
  }

  async createEvidenceFreeze(
    captureJobId: string,
    incidentId: string,
    sourceType: string,
    sourceName: string,
    frozenBy: string,
    notes?: string,
  ): Promise<string> {
    const freezeId = `frz_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    await this.database.pool.query(
      `
        INSERT INTO evidence_freeze (
          freeze_id,
          capture_job_id,
          incident_id,
          source_type,
          source_name,
          frozen_by,
          notes,
          freeze_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'frozen')
      `,
      [freezeId, captureJobId, incidentId, sourceType, sourceName, frozenBy, notes ?? null],
    );
    return freezeId;
  }

  async getEvidenceFreeze(captureJobId: string): Promise<{
    freeze_id: string;
    capture_job_id: string;
    incident_id: string;
    freeze_status: string;
    total_snapshots: number;
    frozen_snapshots: number;
    source_type: string;
    source_name: string;
    frozen_by: string;
    frozen_at: string | null;
    notes: string | null;
    created_at: string;
  } | null> {
    const result = await this.database.pool.query(
      `
        SELECT 
          freeze_id,
          capture_job_id,
          incident_id,
          freeze_status,
          total_snapshots,
          frozen_snapshots,
          source_type,
          source_name,
          frozen_by,
          frozen_at,
          notes,
          created_at
        FROM evidence_freeze
        WHERE capture_job_id = $1
      `,
      [captureJobId],
    );
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0];
    return {
      ...row,
      frozen_at: row.frozen_at ? new Date(row.frozen_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  async listEvidenceFreeze(incidentId: string): Promise<
    Array<{
      freeze_id: string;
      capture_job_id: string;
      freeze_status: string;
      total_snapshots: number;
      frozen_snapshots: number;
      source_type: string;
      source_name: string;
      frozen_at: string | null;
      created_at: string;
    }>
  > {
    const result = await this.database.pool.query(
      `
        SELECT 
          freeze_id,
          capture_job_id,
          freeze_status,
          total_snapshots,
          frozen_snapshots,
          source_type,
          source_name,
          frozen_at,
          created_at
        FROM evidence_freeze
        WHERE incident_id = $1
        ORDER BY created_at DESC
      `,
      [incidentId],
    );
    return result.rows.map((row) => ({
      ...row,
      frozen_at: row.frozen_at ? new Date(row.frozen_at).toISOString() : null,
      created_at: new Date(row.created_at).toISOString(),
    }));
  }

  async getIncidentCaptureStatus(incidentId: string): Promise<{
    incident_id: string;
    total_jobs: number;
    completed_jobs: number;
    active_jobs: number;
    failed_jobs: number;
    total_snapshots: number;
    has_frozen_evidence: boolean;
    sources_captured: string[];
    sources_frozen: string[];
  } | null> {
    const result = await this.database.pool.query(
      `
        SELECT 
          incident_id,
          total_jobs,
          completed_jobs,
          active_jobs,
          failed_jobs,
          total_snapshots,
          has_frozen_evidence,
          sources_captured,
          sources_frozen
        FROM incident_capture_status_view
        WHERE incident_id = $1
      `,
      [incidentId],
    );
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0];
    return {
      ...row,
      has_frozen_evidence: row.has_frozen_evidence ?? false,
      sources_captured: row.sources_captured ?? [],
      sources_frozen: row.sources_frozen ?? [],
    };
  }

  async upsertIncidentIntelligenceArtifact(
    input: UpsertIncidentIntelligenceArtifactInput,
  ): Promise<void> {
    await this.database.pool.query(
      `
        INSERT INTO incident_intelligence_artifacts (
          artifact_id,
          incident_id,
          dedupe_key,
          artifact_type,
          provider,
          title,
          summary,
          url,
          thumbnail_url,
          author,
          published_at,
          captured_at,
          location,
          verification_status,
          confidence,
          source_urls,
          metadata
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12,
          CASE
            WHEN $13::double precision IS NULL OR $14::double precision IS NULL THEN NULL
            ELSE ST_SetSRID(ST_MakePoint($14, $13), 4326)
          END,
          $15, $16, $17, $18::jsonb
        )
        ON CONFLICT (incident_id, dedupe_key)
        DO UPDATE SET
          artifact_type = EXCLUDED.artifact_type,
          provider = EXCLUDED.provider,
          title = EXCLUDED.title,
          summary = EXCLUDED.summary,
          url = EXCLUDED.url,
          thumbnail_url = EXCLUDED.thumbnail_url,
          author = EXCLUDED.author,
          published_at = EXCLUDED.published_at,
          captured_at = EXCLUDED.captured_at,
          location = EXCLUDED.location,
          verification_status = EXCLUDED.verification_status,
          confidence = EXCLUDED.confidence,
          source_urls = EXCLUDED.source_urls,
          metadata = EXCLUDED.metadata
      `,
      [
        randomUUID(),
        input.incident_id,
        input.dedupe_key,
        input.artifact_type,
        input.provider,
        input.title,
        input.summary ?? "",
        input.url,
        input.thumbnail_url ?? null,
        input.author ?? null,
        input.published_at ?? null,
        input.captured_at ?? new Date().toISOString(),
        input.lat ?? null,
        input.lon ?? null,
        input.verification_status,
        input.confidence,
        input.source_urls ?? [],
        JSON.stringify(input.metadata ?? {}),
      ],
    );
  }

  async listIncidentIntelligenceArtifacts(
    incidentId: string,
  ): Promise<IncidentIntelligenceArtifact[]> {
    const result = await this.database.pool.query<IncidentIntelligenceArtifactRow>(
      `
        SELECT
          artifact_id,
          incident_id,
          dedupe_key,
          artifact_type,
          provider,
          title,
          summary,
          url,
          thumbnail_url,
          author,
          published_at,
          captured_at,
          CASE WHEN location IS NOT NULL THEN ST_Y(location) ELSE NULL END AS lat,
          CASE WHEN location IS NOT NULL THEN ST_X(location) ELSE NULL END AS lon,
          verification_status,
          confidence,
          source_urls,
          metadata,
          created_at,
          updated_at
        FROM incident_intelligence_artifacts
        WHERE incident_id = $1
        ORDER BY COALESCE(published_at, captured_at) DESC, created_at DESC
      `,
      [incidentId],
    );

    return result.rows.map(mapIncidentIntelligenceArtifactRow);
  }

  async upsertIncidentWidgetManifest(input: UpsertIncidentWidgetManifestInput): Promise<void> {
    await this.database.pool.query(
      `
        INSERT INTO incident_widget_manifests (
          widget_id,
          incident_id,
          widget_key,
          widget_type,
          title,
          layout,
          priority,
          status,
          generated_by,
          spec
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
        ON CONFLICT (incident_id, widget_key)
        DO UPDATE SET
          widget_type = EXCLUDED.widget_type,
          title = EXCLUDED.title,
          layout = EXCLUDED.layout,
          priority = EXCLUDED.priority,
          status = EXCLUDED.status,
          generated_by = EXCLUDED.generated_by,
          spec = EXCLUDED.spec
      `,
      [
        randomUUID(),
        input.incident_id,
        input.widget_key,
        input.widget_type,
        input.title,
        input.layout,
        input.priority ?? 100,
        input.status ?? "active",
        input.generated_by,
        JSON.stringify(input.spec),
      ],
    );
  }

  async listIncidentWidgetManifests(incidentId: string): Promise<IncidentWidgetManifest[]> {
    const result = await this.database.pool.query<IncidentWidgetManifestRow>(
      `
        SELECT
          widget_id,
          incident_id,
          widget_key,
          widget_type,
          title,
          layout,
          priority,
          status,
          generated_by,
          spec,
          created_at,
          updated_at
        FROM incident_widget_manifests
        WHERE incident_id = $1
        ORDER BY priority ASC, updated_at DESC
      `,
      [incidentId],
    );

    return result.rows.map(mapIncidentWidgetManifestRow);
  }

  async createIncidentIntelligenceRun(input: CreateIncidentIntelligenceRunInput): Promise<void> {
    await this.database.pool.query(
      `
        INSERT INTO incident_intelligence_runs (
          run_id,
          incident_id,
          provider,
          run_type,
          status,
          started_at,
          completed_at,
          error_message,
          stats
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        ON CONFLICT (run_id)
        DO UPDATE SET
          provider = EXCLUDED.provider,
          run_type = EXCLUDED.run_type,
          status = EXCLUDED.status,
          started_at = EXCLUDED.started_at,
          completed_at = EXCLUDED.completed_at,
          error_message = EXCLUDED.error_message,
          stats = EXCLUDED.stats
      `,
      [
        input.run_id,
        input.incident_id,
        input.provider,
        input.run_type,
        input.status,
        input.started_at,
        input.completed_at ?? null,
        input.error_message ?? null,
        JSON.stringify(input.stats ?? {}),
      ],
    );
  }

  async listIncidentIntelligenceRuns(incidentId: string): Promise<IncidentIntelligenceRun[]> {
    const result = await this.database.pool.query<IncidentIntelligenceRunRow>(
      `
        SELECT
          run_id,
          incident_id,
          provider,
          run_type,
          status,
          started_at,
          completed_at,
          error_message,
          stats,
          created_at,
          updated_at
        FROM incident_intelligence_runs
        WHERE incident_id = $1
        ORDER BY started_at DESC
      `,
      [incidentId],
    );

    return result.rows.map(mapIncidentIntelligenceRunRow);
  }

  async getIncidentIntelligenceBundle(incidentId: string): Promise<IncidentIntelligenceBundle> {
    const [artifacts, widgets, runs] = await Promise.all([
      this.listIncidentIntelligenceArtifacts(incidentId),
      this.listIncidentWidgetManifests(incidentId),
      this.listIncidentIntelligenceRuns(incidentId),
    ]);

    return {
      incident_id: incidentId,
      artifacts,
      widgets,
      runs,
    };
  }

  async createInferredEvent(input: {
    inference_type: string;
    confidence: number;
    confidence_level: string;
    time_window_start: string;
    time_window_end: string;
    aoi?: Record<string, unknown>;
    related_source_ids?: string[];
    related_object_ids?: string[];
    related_event_ids?: string[];
    evidence_summary: string;
    details: Record<string, unknown>;
  }): Promise<string> {
    const inferenceId = `inf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    await this.database.pool.query(
      `
        INSERT INTO inferred_events (
          inference_id,
          inference_type,
          confidence,
          confidence_level,
          time_window_start,
          time_window_end,
          aoi,
          related_source_ids,
          related_object_ids,
          related_event_ids,
          evidence_summary,
          details
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          CASE WHEN $7::jsonb IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($7::jsonb::text), 4326) END,
          $8, $9, $10, $11, $12::jsonb
        )
      `,
      [
        inferenceId,
        input.inference_type,
        input.confidence,
        input.confidence_level,
        input.time_window_start,
        input.time_window_end,
        input.aoi ? JSON.stringify(input.aoi) : null,
        input.related_source_ids ?? [],
        input.related_object_ids ?? [],
        input.related_event_ids ?? [],
        input.evidence_summary,
        JSON.stringify(input.details),
      ],
    );

    return inferenceId;
  }

  async getInferredEvent(inferenceId: string): Promise<{
    inference_id: string;
    inference_type: string;
    confidence: number;
    confidence_level: string;
    time_window_start: string;
    time_window_end: string;
    aoi: Record<string, unknown> | null;
    related_source_ids: string[];
    related_object_ids: string[];
    related_event_ids: string[];
    evidence_summary: string;
    inferred_status: string;
    details: Record<string, unknown>;
    created_at: string;
  } | null> {
    const result = await this.database.pool.query(
      `
        SELECT
          inference_id,
          inference_type,
          confidence,
          confidence_level,
          time_window_start,
          time_window_end,
          CASE WHEN aoi IS NULL THEN NULL ELSE ST_AsGeoJSON(aoi)::jsonb END as aoi,
          related_source_ids,
          related_object_ids,
          related_event_ids,
          evidence_summary,
          inferred_status,
          details,
          created_at
        FROM inferred_events
        WHERE inference_id = $1
      `,
      [inferenceId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      ...row,
      time_window_start: new Date(row.time_window_start).toISOString(),
      time_window_end: new Date(row.time_window_end).toISOString(),
      created_at: new Date(row.created_at).toISOString(),
    };
  }

  async listInferredEvents(filters?: {
    inference_type?: string;
    status?: string;
    start_time?: string;
    end_time?: string;
  }): Promise<
    Array<{
      inference_id: string;
      inference_type: string;
      confidence: number;
      confidence_level: string;
      time_window_start: string;
      time_window_end: string;
      evidence_summary: string;
      inferred_status: string;
      created_at: string;
    }>
  > {
    const conditions: string[] = [];
    const params: string[] = [];
    let paramIndex = 1;

    if (filters?.inference_type) {
      conditions.push(`inference_type = $${paramIndex++}`);
      params.push(filters.inference_type);
    }

    if (filters?.status) {
      conditions.push(`inferred_status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters?.start_time) {
      conditions.push(`time_window_start >= $${paramIndex++}`);
      params.push(filters.start_time);
    }

    if (filters?.end_time) {
      conditions.push(`time_window_end <= $${paramIndex++}`);
      params.push(filters.end_time);
    }

    const query = `
      SELECT
        inference_id,
        inference_type,
        confidence,
        confidence_level,
        time_window_start,
        time_window_end,
        evidence_summary,
        inferred_status,
        created_at
      FROM inferred_events
      ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY created_at DESC
    `;

    const result = await this.database.pool.query(query, params);
    return result.rows.map((row) => ({
      ...row,
      time_window_start: new Date(row.time_window_start).toISOString(),
      time_window_end: new Date(row.time_window_end).toISOString(),
      created_at: new Date(row.created_at).toISOString(),
    }));
  }

  async createDegradationZone(input: {
    polygon: Record<string, unknown>;
    severity: string;
    confidence: number;
    affected_signals: number;
    estimated_area_sqkm: number;
    evidence_refs?: string[];
  }): Promise<string> {
    const zoneId = `deg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    await this.database.pool.query(
      `
        INSERT INTO degradation_zones (
          zone_id,
          polygon,
          severity,
          confidence,
          affected_signals,
          estimated_area_sqkm,
          evidence_refs
        )
        VALUES (
          $1,
          ST_SetSRID(ST_GeomFromGeoJSON($2::jsonb::text), 4326),
          $3, $4, $5, $6, $7
        )
      `,
      [
        zoneId,
        JSON.stringify(input.polygon),
        input.severity,
        input.confidence,
        input.affected_signals,
        input.estimated_area_sqkm,
        input.evidence_refs ?? [],
      ],
    );

    return zoneId;
  }

  async listActiveDegradationZones(): Promise<
    Array<{
      zone_id: string;
      severity: string;
      confidence: number;
      affected_signals: number;
      estimated_area_sqkm: number;
      inferred_at: string;
      center_lat: number;
      center_lon: number;
    }>
  > {
    const result = await this.database.pool.query(`
      SELECT
        zone_id,
        severity,
        confidence,
        affected_signals,
        estimated_area_sqkm,
        inferred_at,
        ST_Y(ST_Centroid(polygon)) AS center_lat,
        ST_X(ST_Centroid(polygon)) AS center_lon
      FROM degradation_zones
      WHERE expired_at IS NULL
        AND inferred_at > NOW() - INTERVAL '24 hours'
      ORDER BY inferred_at DESC
    `);

    return result.rows.map((row) => ({
      ...row,
      inferred_at: new Date(row.inferred_at).toISOString(),
    }));
  }

  async createRouteRedirection(input: {
    object_id: string;
    inference_id: string;
    original_path: Array<{ lat: number; lon: number; timestamp: string }>;
    actual_path: Array<{ lat: number; lon: number; timestamp: string }>;
    deviation_meters: number;
    deviation_point: { lat: number; lon: number };
    probable_cause?: string;
  }): Promise<string> {
    const redirectionId = `rrt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    await this.database.pool.query(
      `
        INSERT INTO route_redirections (
          redirection_id,
          object_id,
          inference_id,
          original_path,
          actual_path,
          deviation_meters,
          deviation_point,
          probable_cause
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, ST_SetSRID(ST_Point($7, $8), 4326), $9)
      `,
      [
        redirectionId,
        input.object_id,
        input.inference_id,
        JSON.stringify(input.original_path),
        JSON.stringify(input.actual_path),
        input.deviation_meters,
        input.deviation_point.lon,
        input.deviation_point.lat,
        input.probable_cause ?? null,
      ],
    );

    return redirectionId;
  }

  async createHoldingPattern(input: {
    object_id: string;
    inference_id: string;
    center_point: { lat: number; lon: number };
    radius_meters: number;
    loop_count: number;
    duration_seconds: number;
    orbit_type?: string;
    heading_changes?: number;
  }): Promise<string> {
    const patternId = `hld_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    await this.database.pool.query(
      `
        INSERT INTO holding_patterns (
          pattern_id,
          object_id,
          inference_id,
          center_point,
          radius_meters,
          loop_count,
          duration_seconds,
          orbit_type,
          heading_changes
        )
        VALUES ($1, $2, $3, ST_SetSRID(ST_Point($4, $5), 4326), $6, $7, $8, $9, $10)
      `,
      [
        patternId,
        input.object_id,
        input.inference_id,
        input.center_point.lon,
        input.center_point.lat,
        input.radius_meters,
        input.loop_count,
        input.duration_seconds,
        input.orbit_type ?? null,
        input.heading_changes ?? 0,
      ],
    );

    return patternId;
  }

  async linkInferenceToIncident(
    inferenceId: string,
    incidentId: string,
    linkedBy: string,
  ): Promise<void> {
    await this.database.pool.query(
      `
        INSERT INTO inference_incident_links (inference_id, incident_id, linked_by)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
      `,
      [inferenceId, incidentId, linkedBy],
    );
  }

  async listInferenceTimelineMarkers(incidentId?: string): Promise<
    Array<{
      marker_id: string;
      inference_id: string;
      type: string;
      subtype: string;
      timestamp: string;
      title: string;
      description: string;
      confidence: number;
      confidence_level: string;
      severity: string;
      lat: number | null;
      lon: number | null;
    }>
  > {
    let query = `
      SELECT
        inference_id AS marker_id,
        inference_id,
        'inferred' AS type,
        inference_type AS subtype,
        time_window_start AS timestamp,
        inference_type AS title,
        evidence_summary AS description,
        confidence,
        confidence_level,
        inferred_status AS severity,
        ST_Y(aoi::geometry) AS lat,
        ST_X(aoi::geometry) AS lon
      FROM inferred_events
      WHERE inferred_status = 'active'
    `;
    let needsOrderBy = true;

    const params: string[] = [];

    if (incidentId) {
      query = `
        SELECT
          itm.marker_id,
          itm.inference_id,
          itm.type,
          itm.subtype,
          itm.timestamp,
          itm.title,
          itm.description,
          itm.confidence,
          itm.confidence_level,
          itm.severity,
          itm.lat,
          itm.lon
        FROM inferred_timeline_markers itm
        INNER JOIN inference_incident_links iil ON itm.inference_id = iil.inference_id
        WHERE iil.incident_id = $1
        ORDER BY itm.timestamp DESC
      `;
      needsOrderBy = false;
      params.push(incidentId);
    }

    if (needsOrderBy) {
      query += " ORDER BY timestamp DESC";
    }

    const result = await this.database.pool.query(query, params);
    return result.rows.map((row) => ({
      ...row,
      timestamp: new Date(row.timestamp).toISOString(),
    }));
  }

  async updateInferenceStatus(inferenceId: string, status: string): Promise<void> {
    await this.database.pool.query(
      `
        UPDATE inferred_events
        SET inferred_status = $1, updated_at = NOW()
        WHERE inference_id = $2
      `,
      [status, inferenceId],
    );
  }

  async upsertSourceRegistry(input: {
    source_id: string;
    source_type: string;
    provider: string;
    label: string;
    lat: number | null;
    lon: number | null;
    alt_m: number | null;
    heading_deg: number | null;
    coverage: {
      type: string | null;
      coordinates: number[] | null;
      heading_deg: number | null;
      fov_deg: number | null;
      range_m: number | null;
    } | null;
    status: string;
    last_update: string;
    snapshot_available: boolean;
    live_available: boolean;
    linked_object_ids: string[];
    linked_alert_ids: string[];
    linked_incident_ids: string[];
    metadata: Record<string, unknown>;
  }): Promise<void> {
    await this.database.pool.query(
      `
        INSERT INTO source_registry (
          source_id, source_type, provider, label, lat, lon, alt_m, heading_deg,
          coverage, coverage_type, coverage_heading_deg, coverage_fov_deg, coverage_range_m,
          status, last_update, snapshot_available, live_available,
          linked_object_ids, linked_alert_ids, linked_incident_ids, metadata
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
          $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
        )
        ON CONFLICT (source_id) DO UPDATE SET
          source_type = EXCLUDED.source_type,
          provider = EXCLUDED.provider,
          label = EXCLUDED.label,
          lat = EXCLUDED.lat,
          lon = EXCLUDED.lon,
          alt_m = EXCLUDED.alt_m,
          heading_deg = EXCLUDED.heading_deg,
          coverage = EXCLUDED.coverage,
          coverage_type = EXCLUDED.coverage_type,
          coverage_heading_deg = EXCLUDED.coverage_heading_deg,
          coverage_fov_deg = EXCLUDED.coverage_fov_deg,
          coverage_range_m = EXCLUDED.coverage_range_m,
          status = EXCLUDED.status,
          last_update = EXCLUDED.last_update,
          snapshot_available = EXCLUDED.snapshot_available,
          live_available = EXCLUDED.live_available,
          linked_object_ids = EXCLUDED.linked_object_ids,
          linked_alert_ids = EXCLUDED.linked_alert_ids,
          linked_incident_ids = EXCLUDED.linked_incident_ids,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `,
      [
        input.source_id,
        input.source_type,
        input.provider,
        input.label,
        input.lat ?? null,
        input.lon ?? null,
        input.alt_m ?? null,
        input.heading_deg ?? null,
        input.coverage ? JSON.stringify(input.coverage) : null,
        input.coverage?.type ?? null,
        input.coverage?.heading_deg ?? null,
        input.coverage?.fov_deg ?? null,
        input.coverage?.range_m ?? null,
        input.status,
        input.last_update,
        input.snapshot_available,
        input.live_available,
        input.linked_object_ids,
        input.linked_alert_ids,
        input.linked_incident_ids,
        JSON.stringify(input.metadata),
      ],
    );
  }

  async getSourceRegistry(sourceId: string): Promise<{
    source_id: string;
    source_type: string;
    provider: string;
    label: string;
    lat: number | null;
    lon: number | null;
    alt_m: number | null;
    heading_deg: number | null;
    coverage: {
      type: string | null;
      coordinates: number[] | null;
      heading_deg: number | null;
      fov_deg: number | null;
      range_m: number | null;
    } | null;
    status: string;
    last_update: string;
    snapshot_available: boolean;
    live_available: boolean;
    linked_object_ids: string[];
    linked_alert_ids: string[];
    linked_incident_ids: string[];
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  } | null> {
    const result = await this.database.pool.query(
      `
        SELECT 
          source_id, source_type, provider, label, lat, lon, alt_m, heading_deg,
          coverage, coverage_type, coverage_heading_deg, coverage_fov_deg, coverage_range_m,
          status, last_update, snapshot_available, live_available,
          linked_object_ids, linked_alert_ids, linked_incident_ids, metadata,
          created_at, updated_at
        FROM source_registry
        WHERE source_id = $1
      `,
      [sourceId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      source_id: row.source_id,
      source_type: row.source_type,
      provider: row.provider,
      label: row.label,
      lat: row.lat,
      lon: row.lon,
      alt_m: row.alt_m,
      heading_deg: row.heading_deg,
      coverage: row.coverage ? JSON.parse(row.coverage) : null,
      status: row.status,
      last_update: row.last_update,
      snapshot_available: row.snapshot_available,
      live_available: row.live_available,
      linked_object_ids: row.linked_object_ids,
      linked_alert_ids: row.linked_alert_ids,
      linked_incident_ids: row.linked_incident_ids,
      metadata: row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async listSourceRegistry(): Promise<
    Array<{
      source_id: string;
      source_type: string;
      provider: string;
      label: string;
      lat: number | null;
      lon: number | null;
      alt_m: number | null;
      heading_deg: number | null;
      coverage: {
        type: string | null;
        coordinates: number[] | null;
        heading_deg: number | null;
        fov_deg: number | null;
        range_m: number | null;
      } | null;
      status: string;
      last_update: string;
      snapshot_available: boolean;
      live_available: boolean;
      linked_object_ids: string[];
      linked_alert_ids: string[];
      linked_incident_ids: string[];
      metadata: Record<string, unknown>;
      created_at: string;
      updated_at: string;
    }>
  > {
    const result = await this.database.pool.query(
      `
        SELECT 
          source_id, source_type, provider, label, lat, lon, alt_m, heading_deg,
          coverage, coverage_type, coverage_heading_deg, coverage_fov_deg, coverage_range_m,
          status, last_update, snapshot_available, live_available,
          linked_object_ids, linked_alert_ids, linked_incident_ids, metadata,
          created_at, updated_at
        FROM source_registry
        ORDER BY source_id ASC
      `,
    );

    return result.rows.map((row) => ({
      source_id: row.source_id,
      source_type: row.source_type,
      provider: row.provider,
      label: row.label,
      lat: row.lat,
      lon: row.lon,
      alt_m: row.alt_m,
      heading_deg: row.heading_deg,
      coverage: row.coverage ? JSON.parse(row.coverage) : null,
      status: row.status,
      last_update: row.last_update,
      snapshot_available: row.snapshot_available,
      live_available: row.live_available,
      linked_object_ids: row.linked_object_ids,
      linked_alert_ids: row.linked_alert_ids,
      linked_incident_ids: row.linked_incident_ids,
      metadata: row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  async addSourceLink(input: {
    source_id: string;
    target_type: "object" | "alert" | "incident";
    target_id: string;
    link_type: "explicit" | "nearest";
    distance_m: number | null;
  }): Promise<void> {
    await this.database.pool.query(
      `
        INSERT INTO source_links (
          source_id, target_type, target_id, link_type, distance_m
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (source_id, target_type, target_id) DO UPDATE SET
          link_type = EXCLUDED.link_type,
          distance_m = EXCLUDED.distance_m,
          created_at = NOW()
      `,
      [
        input.source_id,
        input.target_type,
        input.target_id,
        input.link_type,
        input.distance_m ?? null,
      ],
    );
  }

  async removeSourceLink(input: {
    source_id: string;
    target_type: "object" | "alert" | "incident";
    target_id: string;
  }): Promise<void> {
    await this.database.pool.query(
      `
        DELETE FROM source_links
        WHERE source_id = $1 AND target_type = $2 AND target_id = $3
      `,
      [input.source_id, input.target_type, input.target_id],
    );
  }

  async getSourceLinksForTarget(input: {
    target_type: "object" | "alert" | "incident";
    target_id: string;
  }): Promise<
    Array<{
      source_id: string;
      link_type: "explicit" | "nearest";
      distance_m: number | null;
      created_at: string;
    }>
  > {
    const result = await this.database.pool.query(
      `
        SELECT source_id, link_type, distance_m, created_at
        FROM source_links
        WHERE target_type = $1 AND target_id = $2
        ORDER BY created_at DESC
      `,
      [input.target_type, input.target_id],
    );

    return result.rows.map((row) => ({
      source_id: row.source_id,
      link_type: row.link_type,
      distance_m: row.distance_m,
      created_at: row.created_at,
    }));
  }

  async getNearestSourceToPoint(
    lat: number,
    lon: number,
  ): Promise<{
    source_id: string;
    source_type: string;
    provider: string;
    label: string;
    lat: number | null;
    lon: number | null;
    alt_m: number | null;
    heading_deg: number | null;
    coverage: {
      type: string | null;
      coordinates: number[] | null;
      heading_deg: number | null;
      fov_deg: number | null;
      range_m: number | null;
    } | null;
    status: string;
    last_update: string;
    snapshot_available: boolean;
    live_available: boolean;
    linked_object_ids: string[];
    linked_alert_ids: string[];
    linked_incident_ids: string[];
    metadata: Record<string, unknown>;
    distance_m: number;
  } | null> {
    const result = await this.database.pool.query(
      `
        SELECT 
          sr.*,
          ST_Distance(
            ST_SetSRID(ST_Point($1, $2), 4326)::geography,
            ST_SetSRID(ST_Point(sr.lon, sr.lat), 4326)::geography
          ) AS distance_m
        FROM source_registry sr
        WHERE sr.lat IS NOT NULL AND sr.lon IS NOT NULL
        ORDER BY distance_m ASC
        LIMIT 1
      `,
      [lon, lat],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      source_id: row.source_id,
      source_type: row.source_type,
      provider: row.provider,
      label: row.label,
      lat: row.lat,
      lon: row.lon,
      alt_m: row.alt_m,
      heading_deg: row.heading_deg,
      coverage: row.coverage ? JSON.parse(row.coverage) : null,
      status: row.status,
      last_update: row.last_update,
      snapshot_available: row.snapshot_available,
      live_available: row.live_available,
      linked_object_ids: row.linked_object_ids,
      linked_alert_ids: row.linked_alert_ids,
      linked_incident_ids: row.linked_incident_ids,
      metadata: row.metadata,
      distance_m: Number(row.distance_m),
    };
  }

  async listAgentInsights(input: {
    limit: number;
    severity?: string[];
    publishedOnly?: boolean;
  }): Promise<Array<Record<string, unknown>>> {
    let query = `SELECT * FROM agent_insights WHERE 1=1`;
    const params: unknown[] = [];
    let paramIndex = 1;

    if (input.severity && input.severity.length > 0) {
      query += ` AND severity = ANY($${paramIndex}::text[])`;
      params.push(input.severity);
      paramIndex++;
    }

    if (input.publishedOnly) {
      query += ` AND published = true`;
    }

    query += ` ORDER BY timestamp DESC LIMIT $${paramIndex}`;
    params.push(input.limit);

    const result = await this.database.pool.query(query, params);
    return result.rows;
  }
}
