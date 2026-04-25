import { createHash, randomUUID } from "node:crypto";

export type CorrelationSignalType =
  | "convergence"
  | "velocity_spike"
  | "geo_convergence"
  | "layer_correlation"
  | "prediction_leads_news";

export type CorrelationSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface CorrelationSignalInput {
  signal_type: CorrelationSignalType;
  severity: CorrelationSeverity;
  title: string;
  summary: string;
  source_types: string[];
  layer_ids: string[];
  incident_ids?: string[];
  entity_ids?: string[];
  confidence: number;
  observed_at: string;
  metadata?: Record<string, unknown>;
}

export interface CorrelationSignal {
  signal_id: string;
  signal_type: CorrelationSignalType;
  severity: CorrelationSeverity;
  status: "active" | "acknowledged" | "dismissed";
  title: string;
  summary: string;
  source_types: string[];
  layer_ids: string[];
  incident_ids: string[];
  entity_ids: string[];
  confidence: number;
  observed_at: string;
  expires_at: string | null;
  dedupe_key: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function buildDedupeKey(input: CorrelationSignalInput): string {
  const parts = [input.signal_type, ...input.layer_ids.sort(), ...input.source_types.sort()].join(
    "|",
  );
  return createHash("sha256").update(parts).digest("hex").substring(0, 32);
}

export function createCorrelationSignal(input: CorrelationSignalInput): CorrelationSignal {
  const dedupeKey = buildDedupeKey(input);
  const now = new Date().toISOString();
  return {
    signal_id: `sig_${randomUUID().replace(/-/g, "").substring(0, 12)}`,
    signal_type: input.signal_type,
    severity: input.severity,
    status: "active",
    title: input.title,
    summary: input.summary,
    source_types: input.source_types,
    layer_ids: input.layer_ids,
    incident_ids: input.incident_ids ?? [],
    entity_ids: input.entity_ids ?? [],
    confidence: input.confidence,
    observed_at: input.observed_at,
    expires_at: null,
    dedupe_key: dedupeKey,
    metadata: input.metadata ?? {},
    created_at: now,
    updated_at: now,
  };
}

export interface CrossDomainEventSlice {
  layer_id: string;
  event_type: string;
  event_id: string;
  observed_at: string;
  lat?: number | null;
  lon?: number | null;
  payload?: Record<string, unknown>;
}

export interface CrossDomainCorrelatorInput {
  events: CrossDomainEventSlice[];
  timeWindowMs?: number;
  geoThresholdKm?: number;
}

export function detectLayerConvergence(
  input: CrossDomainCorrelatorInput,
): CorrelationSignalInput[] {
  const windowMs = input.timeWindowMs ?? 60 * 60 * 1000; // 1 hour
  const geoThresholdKm = input.geoThresholdKm ?? 50;
  const now = Date.now();
  const recentEvents = input.events.filter((e) => now - Date.parse(e.observed_at) < windowMs);

  // Group by approximate geo cell (0.5 degree grid ≈ 50km)
  const grid = new Map<string, CrossDomainEventSlice[]>();
  for (const event of recentEvents) {
    if (typeof event.lat !== "number" || typeof event.lon !== "number") continue;
    const cell = `${Math.floor(event.lat * 2) / 2},${Math.floor(event.lon * 2) / 2}`;
    const bucket = grid.get(cell) ?? [];
    bucket.push(event);
    grid.set(cell, bucket);
  }

  const signals: CorrelationSignalInput[] = [];

  for (const [, bucket] of grid) {
    const layerIds = new Set(bucket.map((e) => e.layer_id));
    if (layerIds.size >= 3) {
      const types = new Set(bucket.map((e) => e.event_type));
      const centerLat = bucket.reduce((s, e) => s + (e.lat ?? 0), 0) / bucket.length;
      const centerLon = bucket.reduce((s, e) => s + (e.lon ?? 0), 0) / bucket.length;

      signals.push({
        signal_type: "convergence",
        severity: bucket.length > 10 ? "critical" : bucket.length > 5 ? "high" : "medium",
        title: `Cross-domain convergence detected (${bucket.length} events)`,
        summary: `Layers [${Array.from(layerIds).join(", ")}] show simultaneous activity within ${geoThresholdKm}km. Event types: ${Array.from(types).join(", ")}.`,
        source_types: Array.from(types),
        layer_ids: Array.from(layerIds),
        confidence: Math.min(0.95, 0.5 + layerIds.size * 0.1 + bucket.length * 0.02),
        observed_at: new Date().toISOString(),
        metadata: {
          event_count: bucket.length,
          center_lat: centerLat,
          center_lon: centerLon,
          geo_threshold_km: geoThresholdKm,
        },
      });
    }
  }

  return signals;
}

export function detectVelocitySpike(
  currentEvents: CrossDomainEventSlice[],
  previousEvents: CrossDomainEventSlice[],
  timeWindowMs = 60 * 60 * 1000,
): CorrelationSignalInput | null {
  const currentCount = currentEvents.filter(
    (e) => Date.now() - Date.parse(e.observed_at) < timeWindowMs,
  ).length;
  const previousCount = previousEvents.filter(
    (e) => Date.now() - Date.parse(e.observed_at) < timeWindowMs,
  ).length;

  if (previousCount === 0 && currentCount < 3) return null;
  if (previousCount === 0) {
    return {
      signal_type: "velocity_spike",
      severity: currentCount > 20 ? "critical" : currentCount > 10 ? "high" : "medium",
      title: `Activity velocity spike: ${currentCount} events`,
      summary: `Event volume increased from baseline 0 to ${currentCount} within the last hour.`,
      source_types: Array.from(new Set(currentEvents.map((e) => e.event_type))),
      layer_ids: Array.from(new Set(currentEvents.map((e) => e.layer_id))),
      confidence: Math.min(0.9, 0.4 + currentCount * 0.02),
      observed_at: new Date().toISOString(),
      metadata: { previous_count: previousCount, current_count: currentCount, ratio: null },
    };
  }

  const ratio = currentCount / previousCount;
  if (ratio < 2) return null;

  return {
    signal_type: "velocity_spike",
    severity: ratio > 10 ? "critical" : ratio > 5 ? "high" : "medium",
    title: `Activity velocity spike: ${currentCount} events (${ratio.toFixed(1)}x)`,
    summary: `Event volume increased ${ratio.toFixed(1)}x compared to previous window (${previousCount} -> ${currentCount}).`,
    source_types: Array.from(new Set(currentEvents.map((e) => e.event_type))),
    layer_ids: Array.from(new Set(currentEvents.map((e) => e.layer_id))),
    confidence: Math.min(0.95, 0.5 + (ratio - 2) * 0.05),
    observed_at: new Date().toISOString(),
    metadata: { previous_count: previousCount, current_count: currentCount, ratio },
  };
}
