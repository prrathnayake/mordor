import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  type CanonicalEvent,
  OBJECT_STATE_SCHEMA_VERSION,
  type Source,
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
            JSON.stringify(event.payload),
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

  async fetchExternalDataEvents(layerId: string): Promise<
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
          altitude_m,
          payload
        FROM external_data_events
        WHERE layer_id = $1
        ORDER BY observed_at DESC
      `,
      [layerId],
    );

    return result.rows.map((row) => ({
      ...row,
      observed_at: new Date(row.observed_at).toISOString(),
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
}
