import type { Pool } from "pg";
import type { CorrelationSignal, CorrelationSignalInput } from "../../correlation/src/index.js";
import { createCorrelationSignal } from "../../correlation/src/index.js";

export interface CorrelationSignalFilter {
  severity?: string;
  status?: string;
  limit?: number;
}

export async function fetchCorrelationSignals(
  pool: Pool,
  filter: CorrelationSignalFilter,
): Promise<CorrelationSignal[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (filter.severity) {
    conditions.push(`severity = $${idx++}`);
    values.push(filter.severity);
  }
  if (filter.status) {
    conditions.push(`status = $${idx++}`);
    values.push(filter.status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitClause = filter.limit ? `LIMIT $${idx++}` : "";
  if (filter.limit) values.push(filter.limit);

  const result = await pool.query(
    `SELECT * FROM correlation_signals ${whereClause} ORDER BY observed_at DESC ${limitClause}`,
    values,
  );

  return result.rows.map((row) => ({
    signal_id: row.signal_id,
    signal_type: row.signal_type,
    severity: row.severity,
    status: row.status,
    title: row.title,
    summary: row.summary,
    source_types: row.source_types ?? [],
    layer_ids: row.layer_ids ?? [],
    incident_ids: row.incident_ids ?? [],
    entity_ids: row.entity_ids ?? [],
    confidence: row.confidence,
    observed_at: row.observed_at,
    expires_at: row.expires_at,
    dedupe_key: row.dedupe_key,
    metadata: row.metadata ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));
}

export async function persistCorrelationSignal(
  pool: Pool,
  input: CorrelationSignalInput,
): Promise<CorrelationSignal> {
  const signal = createCorrelationSignal(input);
  const result = await pool.query(
    `INSERT INTO correlation_signals (
      signal_id, signal_type, severity, status, title, summary,
      source_types, layer_ids, incident_ids, entity_ids, confidence,
      observed_at, expires_at, dedupe_key, metadata, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT (dedupe_key) DO UPDATE SET
      severity = EXCLUDED.severity,
      status = EXCLUDED.status,
      title = EXCLUDED.title,
      summary = EXCLUDED.summary,
      source_types = EXCLUDED.source_types,
      layer_ids = EXCLUDED.layer_ids,
      incident_ids = EXCLUDED.incident_ids,
      entity_ids = EXCLUDED.entity_ids,
      confidence = EXCLUDED.confidence,
      observed_at = EXCLUDED.observed_at,
      expires_at = EXCLUDED.expires_at,
      metadata = EXCLUDED.metadata,
      updated_at = NOW()
    RETURNING *`,
    [
      signal.signal_id,
      signal.signal_type,
      signal.severity,
      signal.status,
      signal.title,
      signal.summary,
      signal.source_types,
      signal.layer_ids,
      signal.incident_ids,
      signal.entity_ids,
      signal.confidence,
      signal.observed_at,
      signal.expires_at,
      signal.dedupe_key,
      JSON.stringify(signal.metadata),
      signal.created_at,
    ],
  );
  const row = result.rows[0] as CorrelationSignal | undefined;
  return row ?? signal;
}
