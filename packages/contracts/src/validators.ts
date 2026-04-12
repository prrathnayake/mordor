import type {
  Alert,
  CanonicalEvent,
  EventProvenance,
  Geometry,
  ObjectState,
  PositionSnapshot,
  Source,
  TrackedObject,
  VelocitySnapshot,
} from "./models.js";
import { CANONICAL_EVENT_TYPES } from "./models.js";
import type {
  SwanActivityEvent,
  SwanArtifactProjection,
  SwanFinding,
  SwanMediaReference,
} from "./swan-models.js";
import {
  SWAN_ACTIVITY_TYPES,
  SWAN_ARTIFACT_PROJECTIONS,
  SWAN_FINDING_VERIFICATION_STATUSES,
  SWAN_PROJECTION_TARGETS,
  SWAN_TARGET_TYPES,
} from "./swan-models.js";
import {
  ALERT_SCHEMA_VERSION,
  CANONICAL_EVENT_SCHEMA_VERSION,
  OBJECT_STATE_SCHEMA_VERSION,
  SOURCE_SCHEMA_VERSION,
  SWAN_ACTIVITY_SCHEMA_VERSION,
  SWAN_ARTIFACT_PROJECTION_SCHEMA_VERSION,
  SWAN_FINDING_SCHEMA_VERSION,
} from "./versions.js";

export type ValidationResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      issues: string[];
    };

function success<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

function failure<T>(issues: string[]): ValidationResult<T> {
  return { ok: false, issues };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoDateTimeString(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  issues: string[],
  allowedValues?: readonly string[],
): string | undefined {
  const value = record[key];

  if (typeof value !== "string" || value.trim() === "") {
    issues.push(`${key} must be a non-empty string`);
    return undefined;
  }

  if (allowedValues && !allowedValues.includes(value)) {
    issues.push(`${key} must be one of: ${allowedValues.join(", ")}`);
    return undefined;
  }

  return value;
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  issues: string[],
): string | null | undefined {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string" || value.trim() === "") {
    issues.push(`${key} must be a non-empty string when provided`);
    return undefined;
  }

  return value;
}

function readRequiredIsoDateTime(
  record: Record<string, unknown>,
  key: string,
  issues: string[],
): string | undefined {
  const value = readRequiredString(record, key, issues);

  if (value && !isIsoDateTimeString(value)) {
    issues.push(`${key} must be a valid ISO-8601 date-time string`);
    return undefined;
  }

  return value;
}

function readNullableIsoDateTime(
  record: Record<string, unknown>,
  key: string,
  issues: string[],
): string | null | undefined {
  const value = readOptionalString(record, key, issues);

  if (typeof value === "string" && !isIsoDateTimeString(value)) {
    issues.push(`${key} must be a valid ISO-8601 date-time string when provided`);
    return undefined;
  }

  return value;
}

function readRequiredNumber(
  record: Record<string, unknown>,
  key: string,
  issues: string[],
  options?: { min?: number; max?: number },
): number | undefined {
  const value = record[key];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push(`${key} must be a finite number`);
    return undefined;
  }

  if (options?.min !== undefined && value < options.min) {
    issues.push(`${key} must be greater than or equal to ${options.min}`);
  }

  if (options?.max !== undefined && value > options.max) {
    issues.push(`${key} must be less than or equal to ${options.max}`);
  }

  return value;
}

function readOptionalNumber(
  record: Record<string, unknown>,
  key: string,
  issues: string[],
): number | null | undefined {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    issues.push(`${key} must be a finite number when provided`);
    return undefined;
  }

  return value;
}

function readRequiredStringArray(
  record: Record<string, unknown>,
  key: string,
  issues: string[],
  options?: { minLength?: number },
): string[] | undefined {
  const value = record[key];

  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.trim() === "")
  ) {
    issues.push(`${key} must be an array of non-empty strings`);
    return undefined;
  }

  if (options?.minLength !== undefined && value.length < options.minLength) {
    issues.push(`${key} must contain at least ${options.minLength} item(s)`);
  }

  return value;
}

function readOptionalStringArray(
  record: Record<string, unknown>,
  key: string,
  issues: string[],
): string[] | undefined {
  const value = record[key];

  if (value === undefined) {
    return undefined;
  }

  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || entry.trim() === "")
  ) {
    issues.push(`${key} must be an array of non-empty strings when provided`);
    return undefined;
  }

  return value;
}

function readRequiredObject(
  record: Record<string, unknown>,
  key: string,
  issues: string[],
): Record<string, unknown> | undefined {
  const value = record[key];

  if (!isRecord(value)) {
    issues.push(`${key} must be an object`);
    return undefined;
  }

  return value;
}

function validateCoordinatePair(
  value: unknown,
  key: string,
  issues: string[],
): [number, number] | [number, number, number] | undefined {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)) {
    issues.push(`${key} must be a 2D or 3D coordinate tuple`);
    return undefined;
  }

  if (value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) {
    issues.push(`${key} must contain finite numbers`);
    return undefined;
  }

  if (value.length === 2) {
    return [value[0], value[1]];
  }

  return [value[0], value[1], value[2]];
}

function validateGeometry(value: unknown, key: string, issues: string[]): Geometry | undefined {
  if (!isRecord(value)) {
    issues.push(`${key} must be an object`);
    return undefined;
  }

  const type = readRequiredString(value, "type", issues);
  const coordinates = value.coordinates;

  if (!type) {
    return undefined;
  }

  if (type === "Point") {
    const parsed = validateCoordinatePair(coordinates, `${key}.coordinates`, issues);
    return parsed ? { type: "Point", coordinates: parsed } : undefined;
  }

  if (type === "LineString") {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      issues.push(`${key}.coordinates must contain at least one position`);
      return undefined;
    }

    const parsed = coordinates
      .map((entry, index) => validateCoordinatePair(entry, `${key}.coordinates[${index}]`, issues))
      .filter((entry): entry is [number, number] | [number, number, number] => entry !== undefined);

    if (parsed.length !== coordinates.length) {
      return undefined;
    }

    return { type: "LineString", coordinates: parsed };
  }

  if (type === "Polygon") {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      issues.push(`${key}.coordinates must contain at least one linear ring`);
      return undefined;
    }

    const rings = coordinates.map((ring, ringIndex) => {
      if (!Array.isArray(ring) || ring.length < 4) {
        issues.push(`${key}.coordinates[${ringIndex}] must contain at least four positions`);
        return undefined;
      }

      const parsedRing = ring
        .map((entry, positionIndex) =>
          validateCoordinatePair(
            entry,
            `${key}.coordinates[${ringIndex}][${positionIndex}]`,
            issues,
          ),
        )
        .filter(
          (entry): entry is [number, number] | [number, number, number] => entry !== undefined,
        );

      return parsedRing.length === ring.length ? parsedRing : undefined;
    });

    if (rings.some((ring) => ring === undefined)) {
      return undefined;
    }

    return {
      type: "Polygon",
      coordinates: rings as Array<Array<[number, number] | [number, number, number]>>,
    };
  }

  issues.push(`${key}.type must be one of: Point, LineString, Polygon`);
  return undefined;
}

function validateProvenance(value: unknown, issues: string[]): EventProvenance | undefined {
  if (!isRecord(value)) {
    issues.push("provenance must be an object");
    return undefined;
  }

  const adapter = readRequiredString(value, "adapter", issues);
  const adapterVersion = readRequiredString(value, "adapter_version", issues);
  const rawRef = readRequiredString(value, "raw_ref", issues);
  const transformationNotes = readOptionalStringArray(value, "transformation_notes", issues);
  const trustNotes = readOptionalStringArray(value, "trust_notes", issues);

  if (!adapter || !adapterVersion || !rawRef) {
    return undefined;
  }

  return {
    adapter,
    adapter_version: adapterVersion,
    raw_ref: rawRef,
    transformation_notes: transformationNotes,
    trust_notes: trustNotes,
  };
}

function validatePositionSnapshot(
  value: unknown,
  issues: string[],
): PositionSnapshot | null | undefined {
  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    issues.push("position must be an object or null");
    return undefined;
  }

  const lat = readRequiredNumber(value, "lat", issues);
  const lon = readRequiredNumber(value, "lon", issues);
  const altitudeM = readOptionalNumber(value, "altitude_m", issues);
  const geometry =
    value.geometry === undefined
      ? undefined
      : validateGeometry(value.geometry, "position.geometry", issues);

  if (lat === undefined || lon === undefined) {
    return undefined;
  }

  return {
    lat,
    lon,
    altitude_m: altitudeM,
    geometry,
  };
}

function validateVelocitySnapshot(
  value: unknown,
  issues: string[],
): VelocitySnapshot | null | undefined {
  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    issues.push("velocity must be an object or null");
    return undefined;
  }

  const speedMps = readOptionalNumber(value, "speed_mps", issues);
  const headingDeg = readOptionalNumber(value, "heading_deg", issues);

  return {
    speed_mps: speedMps,
    heading_deg: headingDeg,
  };
}

export function validateSource(input: unknown): ValidationResult<Source> {
  const issues: string[] = [];

  if (!isRecord(input)) {
    return failure(["source must be an object"]);
  }

  const sourceId = readRequiredString(input, "source_id", issues);
  const sourceType = readRequiredString(input, "source_type", issues);
  const name = readRequiredString(input, "name", issues);
  const status = readRequiredString(input, "status", issues);
  const owner = readRequiredString(input, "owner", issues);
  const authRef = readRequiredString(input, "auth_ref", issues);
  const pollingMode = readRequiredString(input, "polling_mode", issues);
  const schemaVersion = readRequiredString(input, "schema_version", issues);
  const createdAt = readRequiredIsoDateTime(input, "created_at", issues);
  const updatedAt = readRequiredIsoDateTime(input, "updated_at", issues);

  if (schemaVersion && schemaVersion !== SOURCE_SCHEMA_VERSION) {
    issues.push(`schema_version must equal ${SOURCE_SCHEMA_VERSION}`);
  }

  if (
    issues.length > 0 ||
    !sourceId ||
    !sourceType ||
    !name ||
    !status ||
    !owner ||
    !authRef ||
    !pollingMode ||
    !schemaVersion ||
    !createdAt ||
    !updatedAt
  ) {
    return failure(issues);
  }

  return success({
    source_id: sourceId,
    source_type: sourceType,
    name,
    status,
    owner,
    auth_ref: authRef,
    polling_mode: pollingMode,
    schema_version: schemaVersion,
    created_at: createdAt,
    updated_at: updatedAt,
  });
}

export function validateTrackedObject(input: unknown): ValidationResult<TrackedObject> {
  const issues: string[] = [];

  if (!isRecord(input)) {
    return failure(["tracked object must be an object"]);
  }

  const objectId = readRequiredString(input, "object_id", issues);
  const objectType = readRequiredString(input, "object_type", issues);
  const displayName = readRequiredString(input, "display_name", issues);
  const sourcePrimary = readRequiredString(input, "source_primary", issues);
  const latestStateRef = readOptionalString(input, "latest_state_ref", issues);
  const createdAt = readRequiredIsoDateTime(input, "created_at", issues);
  const updatedAt = readRequiredIsoDateTime(input, "updated_at", issues);
  const tags = readRequiredStringArray(input, "tags", issues);

  if (!Object.hasOwn(input, "latest_state_ref")) {
    issues.push("latest_state_ref must be present and may be null");
  }

  if (
    issues.length > 0 ||
    !objectId ||
    !objectType ||
    !displayName ||
    !sourcePrimary ||
    !createdAt ||
    !updatedAt ||
    !tags
  ) {
    return failure(issues);
  }

  return success({
    object_id: objectId,
    object_type: objectType,
    display_name: displayName,
    source_primary: sourcePrimary,
    latest_state_ref: latestStateRef ?? null,
    created_at: createdAt,
    updated_at: updatedAt,
    tags,
  });
}

export function validateCanonicalEvent(input: unknown): ValidationResult<CanonicalEvent> {
  const issues: string[] = [];

  if (!isRecord(input)) {
    return failure(["canonical event must be an object"]);
  }

  const eventId = readRequiredString(input, "event_id", issues);
  const eventType = readRequiredString(input, "event_type", issues, CANONICAL_EVENT_TYPES);
  const objectId = readRequiredString(input, "object_id", issues);
  const sourceId = readRequiredString(input, "source_id", issues);
  const observedAt = readRequiredIsoDateTime(input, "observed_at", issues);
  const ingestedAt = readRequiredIsoDateTime(input, "ingested_at", issues);
  const processedAt = readRequiredIsoDateTime(input, "processed_at", issues);
  const schemaVersion = readRequiredString(input, "schema_version", issues);
  const payload = readRequiredObject(input, "payload", issues);
  const provenance = validateProvenance(input.provenance, issues);
  const confidence = readRequiredNumber(input, "confidence", issues, { min: 0, max: 1 });
  const dedupeKey = readRequiredString(input, "dedupe_key", issues);
  const geometry =
    input.geometry === undefined ? undefined : validateGeometry(input.geometry, "geometry", issues);
  const altitudeM = readOptionalNumber(input, "altitude_m", issues);
  const headingDeg = readOptionalNumber(input, "heading_deg", issues);
  const speedMps = readOptionalNumber(input, "speed_mps", issues);
  const relatedObjectIds = readOptionalStringArray(input, "related_object_ids", issues);
  const parentEventId = readOptionalString(input, "parent_event_id", issues);
  const traceId = readOptionalString(input, "trace_id", issues);

  if (schemaVersion && schemaVersion !== CANONICAL_EVENT_SCHEMA_VERSION) {
    issues.push(`schema_version must equal ${CANONICAL_EVENT_SCHEMA_VERSION}`);
  }

  if (
    issues.length > 0 ||
    !eventId ||
    !eventType ||
    !objectId ||
    !sourceId ||
    !observedAt ||
    !ingestedAt ||
    !processedAt ||
    !schemaVersion ||
    !payload ||
    !provenance ||
    confidence === undefined ||
    !dedupeKey
  ) {
    return failure(issues);
  }

  return success({
    event_id: eventId,
    event_type: eventType as CanonicalEvent["event_type"],
    object_id: objectId,
    source_id: sourceId,
    observed_at: observedAt,
    ingested_at: ingestedAt,
    processed_at: processedAt,
    schema_version: schemaVersion,
    payload,
    provenance,
    confidence,
    dedupe_key: dedupeKey,
    geometry,
    altitude_m: altitudeM,
    heading_deg: headingDeg,
    speed_mps: speedMps,
    related_object_ids: relatedObjectIds,
    parent_event_id: parentEventId,
    trace_id: traceId,
  });
}

export function validateObjectState(input: unknown): ValidationResult<ObjectState> {
  const issues: string[] = [];

  if (!isRecord(input)) {
    return failure(["object state must be an object"]);
  }

  const objectId = readRequiredString(input, "object_id", issues);
  const stateVersion = readRequiredString(input, "state_version", issues);
  const asOf = readRequiredIsoDateTime(input, "as_of", issues);
  const position = validatePositionSnapshot(input.position, issues);
  const velocity = validateVelocitySnapshot(input.velocity, issues);
  const status = readOptionalString(input, "status", issues);
  const attributes = readRequiredObject(input, "attributes", issues);
  const lastEventId = readRequiredString(input, "last_event_id", issues);

  if (stateVersion && stateVersion !== OBJECT_STATE_SCHEMA_VERSION) {
    issues.push(`state_version must equal ${OBJECT_STATE_SCHEMA_VERSION}`);
  }

  if (!Object.hasOwn(input, "position")) {
    issues.push("position must be present and may be null");
  }

  if (!Object.hasOwn(input, "velocity")) {
    issues.push("velocity must be present and may be null");
  }

  if (!Object.hasOwn(input, "status")) {
    issues.push("status must be present and may be null");
  }

  if (
    issues.length > 0 ||
    !objectId ||
    !stateVersion ||
    !asOf ||
    position === undefined ||
    velocity === undefined ||
    attributes === undefined ||
    !lastEventId
  ) {
    return failure(issues);
  }

  return success({
    object_id: objectId,
    state_version: stateVersion,
    as_of: asOf,
    position,
    velocity,
    status: status ?? null,
    attributes,
    last_event_id: lastEventId,
  });
}

export function validateAlert(input: unknown): ValidationResult<Alert> {
  const issues: string[] = [];

  if (!isRecord(input)) {
    return failure(["alert must be an object"]);
  }

  const alertId = readRequiredString(input, "alert_id", issues);
  const ruleId = readRequiredString(input, "rule_id", issues);
  const severity = readRequiredString(input, "severity", issues);
  const status = readRequiredString(input, "status", issues);
  const openedAt = readRequiredIsoDateTime(input, "opened_at", issues);
  const updatedAt = readRequiredIsoDateTime(input, "updated_at", issues);
  const closedAt = readNullableIsoDateTime(input, "closed_at", issues);
  const schemaVersion = readRequiredString(input, "schema_version", issues);
  const evidenceEventIds = readRequiredStringArray(input, "evidence_event_ids", issues, {
    minLength: 1,
  });
  const evidenceObjectIds = readRequiredStringArray(input, "evidence_object_ids", issues);
  const summary = readRequiredString(input, "summary", issues);
  const explanation = readRequiredString(input, "explanation", issues);
  const confidence = readRequiredNumber(input, "confidence", issues, { min: 0, max: 1 });

  if (schemaVersion && schemaVersion !== ALERT_SCHEMA_VERSION) {
    issues.push(`schema_version must equal ${ALERT_SCHEMA_VERSION}`);
  }

  if (
    issues.length > 0 ||
    !alertId ||
    !ruleId ||
    !severity ||
    !status ||
    !openedAt ||
    !updatedAt ||
    closedAt === undefined ||
    !schemaVersion ||
    !evidenceEventIds ||
    !evidenceObjectIds ||
    !summary ||
    !explanation ||
    confidence === undefined
  ) {
    return failure(issues);
  }

  return success({
    alert_id: alertId,
    rule_id: ruleId,
    severity,
    status,
    opened_at: openedAt,
    updated_at: updatedAt,
    closed_at: closedAt,
    schema_version: schemaVersion,
    evidence_event_ids: evidenceEventIds,
    evidence_object_ids: evidenceObjectIds,
    summary,
    explanation,
    confidence,
  });
}

function validateMediaReference(
  value: unknown,
  issues: string[],
  key: string,
): SwanMediaReference | undefined {
  if (!isRecord(value)) {
    issues.push(`${key} must be an object`);
    return undefined;
  }

  const mediaType = readRequiredString(value, "media_type", issues, ["image", "video"]);
  const url = readRequiredString(value, "url", issues);
  const thumbnailUrl = readOptionalString(value, "thumbnail_url", issues);
  const title = readOptionalString(value, "title", issues);

  if (!mediaType || !url) {
    return undefined;
  }

  return {
    media_type: mediaType as SwanMediaReference["media_type"],
    url,
    thumbnail_url: thumbnailUrl ?? null,
    title: title ?? null,
  };
}

export function validateSwanActivityEvent(input: unknown): ValidationResult<SwanActivityEvent> {
  const issues: string[] = [];

  if (!isRecord(input)) {
    return failure(["swan activity event must be an object"]);
  }

  const schemaVersion = readRequiredString(input, "schema_version", issues);
  const activityId = readRequiredString(input, "activity_id", issues);
  const sessionId = readRequiredString(input, "session_id", issues);
  const clientSessionId = readRequiredString(input, "client_session_id", issues);
  const userId = readRequiredString(input, "user_id", issues);
  const activityType = readRequiredString(input, "activity_type", issues, SWAN_ACTIVITY_TYPES);
  const targetType = readOptionalString(input, "target_type", issues);
  const targetId = readOptionalString(input, "target_id", issues);
  const route = readOptionalString(input, "route", issues);
  const mode = readOptionalString(input, "mode", issues);
  const activityKey = readRequiredString(input, "activity_key", issues);
  const context = readRequiredObject(input, "context", issues);
  const occurredAt = readRequiredIsoDateTime(input, "occurred_at", issues);

  if (schemaVersion && schemaVersion !== SWAN_ACTIVITY_SCHEMA_VERSION) {
    issues.push(`schema_version must equal ${SWAN_ACTIVITY_SCHEMA_VERSION}`);
  }

  if (
    targetType !== undefined &&
    targetType !== null &&
    !SWAN_TARGET_TYPES.includes(targetType as (typeof SWAN_TARGET_TYPES)[number])
  ) {
    issues.push(`target_type must be one of: ${SWAN_TARGET_TYPES.join(", ")}`);
  }

  if (mode !== undefined && mode !== null && !["live", "replay"].includes(mode)) {
    issues.push("mode must be one of: live, replay");
  }

  if (
    issues.length > 0 ||
    !schemaVersion ||
    !activityId ||
    !sessionId ||
    !clientSessionId ||
    !userId ||
    !activityType ||
    !activityKey ||
    !context ||
    !occurredAt
  ) {
    return failure(issues);
  }

  return success({
    schema_version: schemaVersion,
    activity_id: activityId,
    session_id: sessionId,
    client_session_id: clientSessionId,
    user_id: userId,
    activity_type: activityType as SwanActivityEvent["activity_type"],
    target_type: (targetType ?? null) as SwanActivityEvent["target_type"],
    target_id: targetId ?? null,
    route: route ?? null,
    mode: (mode ?? null) as SwanActivityEvent["mode"],
    activity_key: activityKey,
    context,
    occurred_at: occurredAt,
  });
}

export function validateSwanFinding(input: unknown): ValidationResult<SwanFinding> {
  const issues: string[] = [];

  if (!isRecord(input)) {
    return failure(["swan finding must be an object"]);
  }

  const schemaVersion = readRequiredString(input, "schema_version", issues);
  const findingId = readRequiredString(input, "finding_id", issues);
  const sessionId = readRequiredString(input, "session_id", issues);
  const threadId = readRequiredString(input, "thread_id", issues);
  const provider = readRequiredString(input, "provider", issues);
  const targetType = readRequiredString(input, "target_type", issues, SWAN_TARGET_TYPES);
  const targetId = readRequiredString(input, "target_id", issues);
  const findingKind = readRequiredString(input, "finding_kind", issues);
  const title = readRequiredString(input, "title", issues);
  const summary = readRequiredString(input, "summary", issues);
  const details = readRequiredObject(input, "details", issues);
  const verificationStatus = readRequiredString(
    input,
    "verification_status",
    issues,
    SWAN_FINDING_VERIFICATION_STATUSES,
  );
  const confidence = readRequiredNumber(input, "confidence", issues, { min: 0, max: 1 });
  const projectionTargets = readRequiredStringArray(input, "projection_targets", issues);
  const sourceUrls = readRequiredStringArray(input, "source_urls", issues);
  const generatedAt = readRequiredIsoDateTime(input, "generated_at", issues);
  const updatedAt = readRequiredIsoDateTime(input, "updated_at", issues);
  const lat = readOptionalNumber(input, "lat", issues);
  const lon = readOptionalNumber(input, "lon", issues);

  if (schemaVersion && schemaVersion !== SWAN_FINDING_SCHEMA_VERSION) {
    issues.push(`schema_version must equal ${SWAN_FINDING_SCHEMA_VERSION}`);
  }

  if (projectionTargets) {
    for (const projectionTarget of projectionTargets) {
      if (!SWAN_PROJECTION_TARGETS.includes(projectionTarget as never)) {
        issues.push(
          `projection_targets entries must be one of: ${SWAN_PROJECTION_TARGETS.join(", ")}`,
        );
      }
    }
  }

  let media: SwanMediaReference[] | undefined;
  if (!Array.isArray(input.media)) {
    issues.push("media must be an array");
  } else {
    media = input.media
      .map((entry, index) => validateMediaReference(entry, issues, `media[${index}]`))
      .filter((entry): entry is SwanMediaReference => entry !== undefined);

    if (media.length !== input.media.length) {
      media = undefined;
    }
  }

  if (
    issues.length > 0 ||
    !schemaVersion ||
    !findingId ||
    !sessionId ||
    !threadId ||
    !provider ||
    !targetType ||
    !targetId ||
    !findingKind ||
    !title ||
    !summary ||
    !details ||
    !verificationStatus ||
    confidence === undefined ||
    !projectionTargets ||
    !sourceUrls ||
    !generatedAt ||
    !updatedAt ||
    !media
  ) {
    return failure(issues);
  }

  return success({
    schema_version: schemaVersion,
    finding_id: findingId,
    session_id: sessionId,
    thread_id: threadId,
    provider,
    target_type: targetType as SwanFinding["target_type"],
    target_id: targetId,
    finding_kind: findingKind,
    title,
    summary,
    details,
    verification_status: verificationStatus as SwanFinding["verification_status"],
    confidence,
    projection_targets: projectionTargets as SwanFinding["projection_targets"],
    source_urls: sourceUrls,
    media,
    lat: lat ?? null,
    lon: lon ?? null,
    generated_at: generatedAt,
    updated_at: updatedAt,
  });
}

export function validateSwanArtifactProjection(
  input: unknown,
): ValidationResult<SwanArtifactProjection> {
  const issues: string[] = [];

  if (!isRecord(input)) {
    return failure(["swan artifact projection must be an object"]);
  }

  const schemaVersion = readRequiredString(input, "schema_version", issues);
  const sessionId = readRequiredString(input, "session_id", issues);
  const projection = readRequiredString(input, "projection", issues, SWAN_ARTIFACT_PROJECTIONS);
  const generatedAt = readRequiredIsoDateTime(input, "generated_at", issues);
  const data = readRequiredObject(input, "data", issues);

  if (schemaVersion && schemaVersion !== SWAN_ARTIFACT_PROJECTION_SCHEMA_VERSION) {
    issues.push(`schema_version must equal ${SWAN_ARTIFACT_PROJECTION_SCHEMA_VERSION}`);
  }

  if (projection === "panels" && data) {
    if (!isRecord(data.objects) || !isRecord(data.alerts) || !isRecord(data.incidents)) {
      issues.push("panels projection must include objects, alerts, and incidents maps");
    }
  }

  if (projection === "map" && data) {
    if (!Array.isArray(data.overlays)) {
      issues.push("map projection must include overlays array");
    }
  }

  if (projection === "notifications" && data) {
    if (!Array.isArray(data.items)) {
      issues.push("notifications projection must include items array");
    }

    const unreadCount = readOptionalNumber(data, "unread_count", issues);
    if (unreadCount === undefined) {
      issues.push("notifications projection must include unread_count");
    }
  }

  if (projection === "session" && data) {
    if (!Object.hasOwn(data, "session")) {
      issues.push("session projection must include session");
    }
    if (!isRecord(data.thread_counts)) {
      issues.push("session projection must include thread_counts object");
    }
  }

  if (issues.length > 0 || !schemaVersion || !sessionId || !projection || !generatedAt || !data) {
    return failure(issues);
  }

  return success({
    schema_version: schemaVersion,
    session_id: sessionId,
    projection: projection as SwanArtifactProjection["projection"],
    generated_at: generatedAt,
    data: data as SwanArtifactProjection["data"],
  });
}
