import type {
  SwanActivityEvent,
  SwanArtifact,
  SwanFinding,
  SwanSession,
  SwanTargetType,
  SwanThread,
} from "../../contracts/src/index.js";
import {
  SWAN_ACTIVITY_SCHEMA_VERSION,
  SWAN_FINDING_SCHEMA_VERSION,
  SWAN_SESSION_SCHEMA_VERSION,
  SWAN_THREAD_SCHEMA_VERSION,
} from "../../contracts/src/index.js";
import type { PostgresDatabase } from "../../persistence/src/index.js";
import { coerceIsoTimestamp, withTransaction } from "../../persistence/src/index.js";

interface SwanSessionRow {
  session_id: string;
  client_session_id: string;
  user_id: string;
  status: SwanSession["status"];
  current_context: Record<string, unknown>;
  last_activity_at: Date | string;
  last_projection_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SwanActivityRow {
  activity_id: string;
  session_id: string;
  client_session_id: string;
  user_id: string;
  activity_type: SwanActivityEvent["activity_type"];
  target_type: SwanActivityEvent["target_type"];
  target_id: string | null;
  route: string | null;
  mode: SwanActivityEvent["mode"];
  activity_key: string;
  context: Record<string, unknown>;
  occurred_at: Date | string;
}

interface SwanThreadRow {
  thread_id: string;
  session_id: string;
  recipe: SwanThread["recipe"];
  target_type: SwanThread["target_type"];
  target_id: string | null;
  status: SwanThread["status"];
  priority: number;
  dedupe_key: string;
  is_recurring: boolean;
  recurrence_interval_ms: number | null;
  run_count: number;
  queued_at: Date | string | null;
  started_at: Date | string | null;
  completed_at: Date | string | null;
  last_run_at: Date | string | null;
  next_run_at: Date | string | null;
  error_message: string | null;
  context: Record<string, unknown>;
  created_at: Date | string;
  updated_at: Date | string;
}

interface SwanFindingRow {
  finding_id: string;
  session_id: string;
  thread_id: string;
  provider: string;
  target_type: SwanFinding["target_type"];
  target_id: string;
  finding_kind: string;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  verification_status: SwanFinding["verification_status"];
  confidence: number;
  projection_targets: SwanFinding["projection_targets"];
  source_urls: string[];
  media: SwanFinding["media"];
  lat: number | null;
  lon: number | null;
  generated_at: Date | string;
  updated_at: Date | string;
}

interface SwanArtifactRow {
  session_id: string;
  artifact_key: string;
  projection: SwanArtifact["projection"];
  file_path: string;
  checksum: string;
  generated_at: Date | string;
}

export interface SwanFindingWrite {
  finding_id: string;
  session_id: string;
  thread_id: string;
  provider: string;
  target_type: SwanFinding["target_type"];
  target_id: string;
  finding_kind: string;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  verification_status: SwanFinding["verification_status"];
  confidence: number;
  projection_targets: SwanFinding["projection_targets"];
  source_urls: string[];
  media: SwanFinding["media"];
  lat: number | null;
  lon: number | null;
  generated_at: string;
  updated_at: string;
}

export class SwanRepository {
  constructor(private readonly database: PostgresDatabase) {}

  getDatabase(): PostgresDatabase {
    return this.database;
  }

  private mapSession(row: SwanSessionRow): SwanSession {
    return {
      schema_version: SWAN_SESSION_SCHEMA_VERSION,
      session_id: row.session_id,
      client_session_id: row.client_session_id,
      user_id: row.user_id,
      status: row.status,
      current_context: row.current_context ?? {},
      last_activity_at: coerceIsoTimestamp(row.last_activity_at),
      last_projection_at: row.last_projection_at
        ? coerceIsoTimestamp(row.last_projection_at)
        : null,
      created_at: coerceIsoTimestamp(row.created_at),
      updated_at: coerceIsoTimestamp(row.updated_at),
    };
  }

  private mapActivity(row: SwanActivityRow): SwanActivityEvent {
    return {
      schema_version: SWAN_ACTIVITY_SCHEMA_VERSION,
      activity_id: row.activity_id,
      session_id: row.session_id,
      client_session_id: row.client_session_id,
      user_id: row.user_id,
      activity_type: row.activity_type,
      target_type: row.target_type ?? null,
      target_id: row.target_id,
      route: row.route,
      mode: row.mode ?? null,
      activity_key: row.activity_key,
      context: row.context ?? {},
      occurred_at: coerceIsoTimestamp(row.occurred_at),
    };
  }

  private mapThread(row: SwanThreadRow): SwanThread {
    return {
      schema_version: SWAN_THREAD_SCHEMA_VERSION,
      thread_id: row.thread_id,
      session_id: row.session_id,
      recipe: row.recipe,
      target_type: row.target_type ?? null,
      target_id: row.target_id,
      status: row.status,
      priority: row.priority,
      dedupe_key: row.dedupe_key,
      is_recurring: row.is_recurring,
      recurrence_interval_ms: row.recurrence_interval_ms,
      run_count: row.run_count,
      queued_at: row.queued_at ? coerceIsoTimestamp(row.queued_at) : null,
      started_at: row.started_at ? coerceIsoTimestamp(row.started_at) : null,
      completed_at: row.completed_at ? coerceIsoTimestamp(row.completed_at) : null,
      last_run_at: row.last_run_at ? coerceIsoTimestamp(row.last_run_at) : null,
      next_run_at: row.next_run_at ? coerceIsoTimestamp(row.next_run_at) : null,
      error_message: row.error_message,
      context: row.context ?? {},
      created_at: coerceIsoTimestamp(row.created_at),
      updated_at: coerceIsoTimestamp(row.updated_at),
    };
  }

  private mapFinding(row: SwanFindingRow): SwanFinding {
    return {
      schema_version: SWAN_FINDING_SCHEMA_VERSION,
      finding_id: row.finding_id,
      session_id: row.session_id,
      thread_id: row.thread_id,
      provider: row.provider,
      target_type: row.target_type,
      target_id: row.target_id,
      finding_kind: row.finding_kind,
      title: row.title,
      summary: row.summary,
      details: row.details ?? {},
      verification_status: row.verification_status,
      confidence: row.confidence,
      projection_targets: row.projection_targets ?? [],
      source_urls: row.source_urls ?? [],
      media: row.media ?? [],
      lat: row.lat,
      lon: row.lon,
      generated_at: coerceIsoTimestamp(row.generated_at),
      updated_at: coerceIsoTimestamp(row.updated_at),
    };
  }

  private mapArtifact(row: SwanArtifactRow): SwanArtifact {
    return {
      session_id: row.session_id,
      artifact_key: row.artifact_key,
      projection: row.projection,
      file_path: row.file_path,
      checksum: row.checksum,
      generated_at: coerceIsoTimestamp(row.generated_at),
    };
  }

  async upsertSession(input: {
    session_id: string;
    client_session_id: string;
    user_id: string;
    current_context: Record<string, unknown>;
    occurred_at: string;
  }): Promise<SwanSession> {
    const result = await this.database.pool.query<SwanSessionRow>(
      `
        INSERT INTO swan_sessions (
          session_id,
          client_session_id,
          user_id,
          status,
          current_context,
          last_activity_at,
          last_projection_at,
          enabled_at
        )
        VALUES ($1, $2, $3, 'active', $4::jsonb, $5, NULL, NOW())
        ON CONFLICT (user_id, client_session_id) DO UPDATE SET
          status = 'active',
          current_context = EXCLUDED.current_context,
          last_activity_at = EXCLUDED.last_activity_at,
          disabled_at = NULL,
          updated_at = NOW()
        RETURNING
          session_id,
          client_session_id,
          user_id,
          status,
          current_context,
          last_activity_at,
          last_projection_at,
          created_at,
          updated_at
      `,
      [
        input.session_id,
        input.client_session_id,
        input.user_id,
        JSON.stringify(input.current_context),
        input.occurred_at,
      ],
    );

    return this.mapSession(result.rows[0]);
  }

  async getSessionByClientSession(
    userId: string,
    clientSessionId: string,
  ): Promise<SwanSession | null> {
    const result = await this.database.pool.query<SwanSessionRow>(
      `
        SELECT
          session_id,
          client_session_id,
          user_id,
          status,
          current_context,
          last_activity_at,
          last_projection_at,
          created_at,
          updated_at
        FROM swan_sessions
        WHERE user_id = $1 AND client_session_id = $2
      `,
      [userId, clientSessionId],
    );

    return result.rows[0] ? this.mapSession(result.rows[0]) : null;
  }

  async getSession(sessionId: string): Promise<SwanSession | null> {
    const result = await this.database.pool.query<SwanSessionRow>(
      `
        SELECT
          session_id,
          client_session_id,
          user_id,
          status,
          current_context,
          last_activity_at,
          last_projection_at,
          created_at,
          updated_at
        FROM swan_sessions
        WHERE session_id = $1
      `,
      [sessionId],
    );

    return result.rows[0] ? this.mapSession(result.rows[0]) : null;
  }

  async listActiveSessions(): Promise<SwanSession[]> {
    const result = await this.database.pool.query<SwanSessionRow>(
      `
        SELECT
          session_id,
          client_session_id,
          user_id,
          status,
          current_context,
          last_activity_at,
          last_projection_at,
          created_at,
          updated_at
        FROM swan_sessions
        WHERE status = 'active'
        ORDER BY last_activity_at DESC
      `,
    );

    return result.rows.map((row) => this.mapSession(row));
  }

  async updateSessionContext(
    sessionId: string,
    currentContext: Record<string, unknown>,
    occurredAt: string,
  ): Promise<SwanSession> {
    const result = await this.database.pool.query<SwanSessionRow>(
      `
        UPDATE swan_sessions
        SET
          current_context = $2::jsonb,
          last_activity_at = $3,
          updated_at = NOW()
        WHERE session_id = $1
        RETURNING
          session_id,
          client_session_id,
          user_id,
          status,
          current_context,
          last_activity_at,
          last_projection_at,
          created_at,
          updated_at
      `,
      [sessionId, JSON.stringify(currentContext), occurredAt],
    );

    return this.mapSession(result.rows[0]);
  }

  async setSessionProjectionTime(sessionId: string, generatedAt: string): Promise<void> {
    await this.database.pool.query(
      `
        UPDATE swan_sessions
        SET last_projection_at = $2, updated_at = NOW()
        WHERE session_id = $1
      `,
      [sessionId, generatedAt],
    );
  }

  async disableSession(
    sessionId: string,
    status: SwanSession["status"],
    occurredAt: string,
  ): Promise<void> {
    await this.database.pool.query(
      `
        UPDATE swan_sessions
        SET
          status = $2,
          disabled_at = $3,
          updated_at = NOW()
        WHERE session_id = $1
      `,
      [sessionId, status, occurredAt],
    );
  }

  async expireIdleSessions(cutoffIso: string): Promise<SwanSession[]> {
    const result = await this.database.pool.query<SwanSessionRow>(
      `
        UPDATE swan_sessions
        SET
          status = 'expired',
          disabled_at = NOW(),
          updated_at = NOW()
        WHERE status = 'active' AND last_activity_at < $1
        RETURNING
          session_id,
          client_session_id,
          user_id,
          status,
          current_context,
          last_activity_at,
          last_projection_at,
          created_at,
          updated_at
      `,
      [cutoffIso],
    );

    return result.rows.map((row) => this.mapSession(row));
  }

  async insertActivity(input: {
    activity_id: string;
    session_id: string;
    client_session_id: string;
    user_id: string;
    activity_type: SwanActivityEvent["activity_type"];
    target_type: SwanActivityEvent["target_type"];
    target_id: string | null;
    route: string | null;
    mode: SwanActivityEvent["mode"];
    activity_key: string;
    context: Record<string, unknown>;
    occurred_at: string;
  }): Promise<SwanActivityEvent> {
    const result = await this.database.pool.query<SwanActivityRow>(
      `
        INSERT INTO swan_activity_events (
          activity_id,
          session_id,
          client_session_id,
          user_id,
          activity_type,
          target_type,
          target_id,
          route,
          mode,
          activity_key,
          context,
          occurred_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)
        RETURNING
          activity_id,
          session_id,
          client_session_id,
          user_id,
          activity_type,
          target_type,
          target_id,
          route,
          mode,
          activity_key,
          context,
          occurred_at
      `,
      [
        input.activity_id,
        input.session_id,
        input.client_session_id,
        input.user_id,
        input.activity_type,
        input.target_type,
        input.target_id,
        input.route,
        input.mode,
        input.activity_key,
        JSON.stringify(input.context),
        input.occurred_at,
      ],
    );

    return this.mapActivity(result.rows[0]);
  }

  async hasRecentActivity(
    sessionId: string,
    activityKey: string,
    sinceIso: string,
  ): Promise<boolean> {
    const result = await this.database.pool.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM swan_activity_events
          WHERE session_id = $1
            AND activity_key = $2
            AND occurred_at >= $3
        ) AS exists
      `,
      [sessionId, activityKey, sinceIso],
    );

    return result.rows[0]?.exists ?? false;
  }

  async upsertThread(input: {
    thread_id: string;
    session_id: string;
    recipe: SwanThread["recipe"];
    target_type: SwanThread["target_type"];
    target_id: string | null;
    status: SwanThread["status"];
    priority: number;
    dedupe_key: string;
    is_recurring: boolean;
    recurrence_interval_ms: number | null;
    queued_at: string | null;
    next_run_at: string | null;
    context: Record<string, unknown>;
  }): Promise<SwanThread> {
    const result = await this.database.pool.query<SwanThreadRow>(
      `
        INSERT INTO swan_threads (
          thread_id,
          session_id,
          recipe,
          target_type,
          target_id,
          status,
          priority,
          dedupe_key,
          is_recurring,
          recurrence_interval_ms,
          queued_at,
          next_run_at,
          context
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
        ON CONFLICT (session_id, dedupe_key) DO UPDATE SET
          recipe = EXCLUDED.recipe,
          target_type = EXCLUDED.target_type,
          target_id = EXCLUDED.target_id,
          status = EXCLUDED.status,
          priority = EXCLUDED.priority,
          is_recurring = EXCLUDED.is_recurring,
          recurrence_interval_ms = EXCLUDED.recurrence_interval_ms,
          queued_at = EXCLUDED.queued_at,
          next_run_at = EXCLUDED.next_run_at,
          context = EXCLUDED.context,
          error_message = NULL,
          updated_at = NOW()
        RETURNING
          thread_id,
          session_id,
          recipe,
          target_type,
          target_id,
          status,
          priority,
          dedupe_key,
          is_recurring,
          recurrence_interval_ms,
          run_count,
          queued_at,
          started_at,
          completed_at,
          last_run_at,
          next_run_at,
          error_message,
          context,
          created_at,
          updated_at
      `,
      [
        input.thread_id,
        input.session_id,
        input.recipe,
        input.target_type,
        input.target_id,
        input.status,
        input.priority,
        input.dedupe_key,
        input.is_recurring,
        input.recurrence_interval_ms,
        input.queued_at,
        input.next_run_at,
        JSON.stringify(input.context),
      ],
    );

    return this.mapThread(result.rows[0]);
  }

  async listRunnableThreads(limit: number): Promise<SwanThread[]> {
    const result = await this.database.pool.query<SwanThreadRow>(
      `
        SELECT
          st.thread_id,
          st.session_id,
          st.recipe,
          st.target_type,
          st.target_id,
          st.status,
          st.priority,
          st.dedupe_key,
          st.is_recurring,
          st.recurrence_interval_ms,
          st.run_count,
          st.queued_at,
          st.started_at,
          st.completed_at,
          st.last_run_at,
          st.next_run_at,
          st.error_message,
          st.context,
          st.created_at,
          st.updated_at
        FROM swan_threads st
        INNER JOIN swan_sessions ss ON ss.session_id = st.session_id
        WHERE ss.status = 'active'
          AND st.status = 'queued'
          AND (st.next_run_at IS NULL OR st.next_run_at <= NOW())
        ORDER BY st.priority DESC, st.queued_at ASC NULLS LAST, st.created_at ASC
        LIMIT $1
      `,
      [limit],
    );

    return result.rows.map((row) => this.mapThread(row));
  }

  async queueDueRecurringThreads(): Promise<number> {
    const result = await this.database.pool.query(
      `
        UPDATE swan_threads st
        SET
          status = 'queued',
          queued_at = NOW(),
          error_message = NULL,
          updated_at = NOW()
        FROM swan_sessions ss
        WHERE st.session_id = ss.session_id
          AND ss.status = 'active'
          AND st.is_recurring = true
          AND st.status IN ('completed', 'failed')
          AND st.next_run_at IS NOT NULL
          AND st.next_run_at <= NOW()
      `,
    );

    return result.rowCount ?? 0;
  }

  async markThreadRunning(threadId: string, startedAt: string): Promise<SwanThread> {
    const result = await this.database.pool.query<SwanThreadRow>(
      `
        UPDATE swan_threads
        SET
          status = 'running',
          started_at = $2,
          last_run_at = $2,
          run_count = run_count + 1,
          updated_at = NOW()
        WHERE thread_id = $1
        RETURNING
          thread_id,
          session_id,
          recipe,
          target_type,
          target_id,
          status,
          priority,
          dedupe_key,
          is_recurring,
          recurrence_interval_ms,
          run_count,
          queued_at,
          started_at,
          completed_at,
          last_run_at,
          next_run_at,
          error_message,
          context,
          created_at,
          updated_at
      `,
      [threadId, startedAt],
    );

    return this.mapThread(result.rows[0]);
  }

  async finalizeThread(input: {
    thread_id: string;
    status: SwanThread["status"];
    completed_at: string;
    next_run_at: string | null;
    error_message?: string | null;
  }): Promise<SwanThread> {
    const result = await this.database.pool.query<SwanThreadRow>(
      `
        UPDATE swan_threads
        SET
          status = $2,
          completed_at = $3,
          next_run_at = $4,
          error_message = $5,
          updated_at = NOW()
        WHERE thread_id = $1
        RETURNING
          thread_id,
          session_id,
          recipe,
          target_type,
          target_id,
          status,
          priority,
          dedupe_key,
          is_recurring,
          recurrence_interval_ms,
          run_count,
          queued_at,
          started_at,
          completed_at,
          last_run_at,
          next_run_at,
          error_message,
          context,
          created_at,
          updated_at
      `,
      [
        input.thread_id,
        input.status,
        input.completed_at,
        input.next_run_at,
        input.error_message ?? null,
      ],
    );

    return this.mapThread(result.rows[0]);
  }

  async cancelThreadsForSession(sessionId: string): Promise<string[]> {
    const result = await this.database.pool.query<{ thread_id: string }>(
      `
        UPDATE swan_threads
        SET
          status = 'cancelled',
          error_message = NULL,
          completed_at = NOW(),
          next_run_at = NULL,
          updated_at = NOW()
        WHERE session_id = $1
          AND status IN ('queued', 'running', 'completed', 'failed')
        RETURNING thread_id
      `,
      [sessionId],
    );

    return result.rows.map((row) => row.thread_id);
  }

  async cancelThreadsForTargetReplacement(
    sessionId: string,
    targetType: SwanTargetType,
    keepTargetId: string,
  ): Promise<string[]> {
    const result = await this.database.pool.query<{ thread_id: string }>(
      `
        UPDATE swan_threads
        SET
          status = 'cancelled',
          error_message = NULL,
          completed_at = NOW(),
          next_run_at = NULL,
          updated_at = NOW()
        WHERE session_id = $1
          AND target_type = $2
          AND target_id IS NOT NULL
          AND target_id <> $3
          AND status IN ('queued', 'running', 'completed', 'failed')
        RETURNING thread_id
      `,
      [sessionId, targetType, keepTargetId],
    );

    return result.rows.map((row) => row.thread_id);
  }

  async cancelThreadByDedupeKey(sessionId: string, dedupeKey: string): Promise<string[]> {
    const result = await this.database.pool.query<{ thread_id: string }>(
      `
        UPDATE swan_threads
        SET
          status = 'cancelled',
          error_message = NULL,
          completed_at = NOW(),
          next_run_at = NULL,
          updated_at = NOW()
        WHERE session_id = $1
          AND dedupe_key = $2
          AND status IN ('queued', 'running', 'completed', 'failed')
        RETURNING thread_id
      `,
      [sessionId, dedupeKey],
    );

    return result.rows.map((row) => row.thread_id);
  }

  async listThreadsForSession(sessionId: string): Promise<SwanThread[]> {
    const result = await this.database.pool.query<SwanThreadRow>(
      `
        SELECT
          thread_id,
          session_id,
          recipe,
          target_type,
          target_id,
          status,
          priority,
          dedupe_key,
          is_recurring,
          recurrence_interval_ms,
          run_count,
          queued_at,
          started_at,
          completed_at,
          last_run_at,
          next_run_at,
          error_message,
          context,
          created_at,
          updated_at
        FROM swan_threads
        WHERE session_id = $1
        ORDER BY updated_at DESC, created_at DESC
      `,
      [sessionId],
    );

    return result.rows.map((row) => this.mapThread(row));
  }

  async replaceFindingsForThread(
    threadId: string,
    sessionId: string,
    findings: SwanFindingWrite[],
  ): Promise<SwanFinding[]> {
    return withTransaction(this.database, async (client) => {
      await client.query(`DELETE FROM swan_findings WHERE thread_id = $1`, [threadId]);

      const inserted: SwanFinding[] = [];
      for (const finding of findings) {
        const result = await client.query<SwanFindingRow>(
          `
            INSERT INTO swan_findings (
              finding_id,
              session_id,
              thread_id,
              provider,
              target_type,
              target_id,
              finding_kind,
              title,
              summary,
              details,
              verification_status,
              confidence,
              projection_targets,
              source_urls,
              media,
              lat,
              lon,
              generated_at,
              updated_at
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13::text[],
              $14::text[], $15::jsonb, $16, $17, $18, $19
            )
            RETURNING
              finding_id,
              session_id,
              thread_id,
              provider,
              target_type,
              target_id,
              finding_kind,
              title,
              summary,
              details,
              verification_status,
              confidence,
              projection_targets,
              source_urls,
              media,
              lat,
              lon,
              generated_at,
              updated_at
          `,
          [
            finding.finding_id,
            sessionId,
            threadId,
            finding.provider,
            finding.target_type,
            finding.target_id,
            finding.finding_kind,
            finding.title,
            finding.summary,
            JSON.stringify(finding.details),
            finding.verification_status,
            finding.confidence,
            finding.projection_targets,
            finding.source_urls,
            JSON.stringify(finding.media),
            finding.lat,
            finding.lon,
            finding.generated_at,
            finding.updated_at,
          ],
        );

        inserted.push(this.mapFinding(result.rows[0]));
      }

      return inserted;
    });
  }

  async listFindingsForSession(sessionId: string): Promise<SwanFinding[]> {
    const result = await this.database.pool.query<SwanFindingRow>(
      `
        SELECT
          finding_id,
          session_id,
          thread_id,
          provider,
          target_type,
          target_id,
          finding_kind,
          title,
          summary,
          details,
          verification_status,
          confidence,
          projection_targets,
          source_urls,
          media,
          lat,
          lon,
          generated_at,
          updated_at
        FROM swan_findings
        WHERE session_id = $1
        ORDER BY generated_at DESC, finding_id DESC
      `,
      [sessionId],
    );

    return result.rows.map((row) => this.mapFinding(row));
  }

  async listFindings(input: {
    session_id?: string;
    target_type?: SwanFinding["target_type"];
    target_id?: string;
    verification_status?: SwanFinding["verification_status"];
    limit?: number;
  }): Promise<SwanFinding[]> {
    const conditions: string[] = [];
    const params: Array<string | number> = [];
    let paramIndex = 1;

    if (input.session_id) {
      conditions.push(`session_id = $${paramIndex++}`);
      params.push(input.session_id);
    }

    if (input.target_type) {
      conditions.push(`target_type = $${paramIndex++}`);
      params.push(input.target_type);
    }

    if (input.target_id) {
      conditions.push(`target_id = $${paramIndex++}`);
      params.push(input.target_id);
    }

    if (input.verification_status) {
      conditions.push(`verification_status = $${paramIndex++}`);
      params.push(input.verification_status);
    }

    const limit = Math.min(input.limit ?? 50, 200);
    params.push(limit);

    const query = `
      SELECT
        finding_id,
        session_id,
        thread_id,
        provider,
        target_type,
        target_id,
        finding_kind,
        title,
        summary,
        details,
        verification_status,
        confidence,
        projection_targets,
        source_urls,
        media,
        lat,
        lon,
        generated_at,
        updated_at
      FROM swan_findings
      ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
      ORDER BY generated_at DESC, finding_id DESC
      LIMIT $${paramIndex}
    `;

    const result = await this.database.pool.query<SwanFindingRow>(query, params);
    return result.rows.map((row) => this.mapFinding(row));
  }

  async listFindingsForThread(threadId: string): Promise<SwanFinding[]> {
    const result = await this.database.pool.query<SwanFindingRow>(
      `
        SELECT
          finding_id,
          session_id,
          thread_id,
          provider,
          target_type,
          target_id,
          finding_kind,
          title,
          summary,
          details,
          verification_status,
          confidence,
          projection_targets,
          source_urls,
          media,
          lat,
          lon,
          generated_at,
          updated_at
        FROM swan_findings
        WHERE thread_id = $1
        ORDER BY generated_at DESC, finding_id DESC
      `,
      [threadId],
    );

    return result.rows.map((row) => this.mapFinding(row));
  }

  async upsertArtifact(input: {
    artifact_id: string;
    session_id: string;
    artifact_key: string;
    projection: SwanArtifact["projection"];
    file_path: string;
    checksum: string;
    generated_at: string;
  }): Promise<SwanArtifact> {
    const result = await this.database.pool.query<SwanArtifactRow>(
      `
        INSERT INTO swan_artifacts (
          artifact_id,
          session_id,
          artifact_key,
          projection,
          file_path,
          checksum,
          generated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (session_id, artifact_key) DO UPDATE SET
          projection = EXCLUDED.projection,
          file_path = EXCLUDED.file_path,
          checksum = EXCLUDED.checksum,
          generated_at = EXCLUDED.generated_at,
          updated_at = NOW()
        RETURNING
          session_id,
          artifact_key,
          projection,
          file_path,
          checksum,
          generated_at
      `,
      [
        input.artifact_id,
        input.session_id,
        input.artifact_key,
        input.projection,
        input.file_path,
        input.checksum,
        input.generated_at,
      ],
    );

    return this.mapArtifact(result.rows[0]);
  }

  async getArtifact(sessionId: string, artifactKey: string): Promise<SwanArtifact | null> {
    const result = await this.database.pool.query<SwanArtifactRow>(
      `
        SELECT
          session_id,
          artifact_key,
          projection,
          file_path,
          checksum,
          generated_at
        FROM swan_artifacts
        WHERE session_id = $1 AND artifact_key = $2
      `,
      [sessionId, artifactKey],
    );

    return result.rows[0] ? this.mapArtifact(result.rows[0]) : null;
  }

  async listArtifactsForSession(sessionId: string): Promise<SwanArtifact[]> {
    const result = await this.database.pool.query<SwanArtifactRow>(
      `
        SELECT
          session_id,
          artifact_key,
          projection,
          file_path,
          checksum,
          generated_at
        FROM swan_artifacts
        WHERE session_id = $1
        ORDER BY generated_at DESC, artifact_key ASC
      `,
      [sessionId],
    );

    return result.rows.map((row) => this.mapArtifact(row));
  }

  async fetchObjectContext(objectId: string): Promise<{
    object_id: string;
    object_type: string | null;
    display_name: string | null;
    source_primary: string | null;
    state_version: string;
    as_of: string;
    lat: number | null;
    lon: number | null;
    status: string | null;
    attributes: Record<string, unknown>;
    last_event_id: string;
  } | null> {
    const result = await this.database.pool.query(
      `
        SELECT
          los.object_id,
          tobj.object_type,
          tobj.display_name,
          tobj.source_primary,
          los.state_version,
          los.as_of,
          CASE WHEN los.position IS NOT NULL THEN ST_Y(los.position) ELSE NULL END AS lat,
          CASE WHEN los.position IS NOT NULL THEN ST_X(los.position) ELSE NULL END AS lon,
          los.status,
          los.attributes,
          los.last_event_id
        FROM latest_object_states los
        LEFT JOIN tracked_objects tobj ON tobj.object_id = los.object_id
        WHERE los.object_id = $1
      `,
      [objectId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      object_id: row.object_id,
      object_type: row.object_type ?? null,
      display_name: row.display_name ?? null,
      source_primary: row.source_primary ?? null,
      state_version: row.state_version,
      as_of: new Date(row.as_of).toISOString(),
      lat: row.lat === null ? null : Number(row.lat),
      lon: row.lon === null ? null : Number(row.lon),
      status: row.status ?? null,
      attributes: row.attributes ?? {},
      last_event_id: row.last_event_id,
    };
  }

  async fetchAlertsByObject(objectId: string): Promise<
    Array<{
      alert_id: string;
      severity: string;
      status: string;
      summary: string;
    }>
  > {
    const result = await this.database.pool.query(
      `
        SELECT alert_id, severity, status, summary
        FROM alerts
        WHERE $1 = ANY(evidence_object_ids)
        ORDER BY opened_at DESC
        LIMIT 5
      `,
      [objectId],
    );

    return result.rows.map((row) => ({
      alert_id: row.alert_id,
      severity: row.severity,
      status: row.status,
      summary: row.summary,
    }));
  }

  async fetchRecentObjectEvents(
    objectId: string,
    limit: number,
  ): Promise<Array<{ event_id: string; event_type: string; observed_at: string }>> {
    const result = await this.database.pool.query(
      `
        SELECT event_id, event_type, observed_at
        FROM canonical_events
        WHERE object_id = $1
        ORDER BY observed_at DESC, ingested_at DESC
        LIMIT $2
      `,
      [objectId, limit],
    );

    return result.rows.map((row) => ({
      event_id: row.event_id,
      event_type: row.event_type,
      observed_at: new Date(row.observed_at).toISOString(),
    }));
  }

  async fetchAlertContext(alertId: string): Promise<{
    alert_id: string;
    rule_id: string;
    severity: string;
    status: string;
    opened_at: string;
    updated_at: string;
    closed_at: string | null;
    evidence_event_ids: string[];
    evidence_object_ids: string[];
    summary: string;
    explanation: string;
    confidence: number;
  } | null> {
    const result = await this.database.pool.query(
      `
        SELECT
          alert_id,
          rule_id,
          severity,
          status,
          opened_at,
          updated_at,
          closed_at,
          evidence_event_ids,
          evidence_object_ids,
          summary,
          explanation,
          confidence
        FROM alerts
        WHERE alert_id = $1
      `,
      [alertId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      alert_id: row.alert_id,
      rule_id: row.rule_id,
      severity: row.severity,
      status: row.status,
      opened_at: new Date(row.opened_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
      closed_at: row.closed_at ? new Date(row.closed_at).toISOString() : null,
      evidence_event_ids: row.evidence_event_ids ?? [],
      evidence_object_ids: row.evidence_object_ids ?? [],
      summary: row.summary,
      explanation: row.explanation,
      confidence: Number(row.confidence),
    };
  }

  async fetchIncidentContext(incidentId: string): Promise<{
    incident_id: string;
    title: string;
    description: string;
    start_at: string;
    end_at: string;
    aoi: Record<string, unknown> | null;
    status: string;
    severity: string;
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
          CASE WHEN aoi IS NOT NULL THEN ST_AsGeoJSON(aoi)::jsonb ELSE NULL END AS aoi,
          status,
          severity,
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
      incident_id: row.incident_id,
      title: row.title,
      description: row.description,
      start_at: new Date(row.start_at).toISOString(),
      end_at: new Date(row.end_at).toISOString(),
      aoi: row.aoi ?? null,
      status: row.status,
      severity: row.severity,
      tags: row.tags ?? [],
    };
  }

  async fetchIncidentEvidenceSummary(incidentId: string): Promise<{
    evidence_count: number;
    total_jobs: number;
    completed_jobs: number;
  }> {
    const evidenceResult = await this.database.pool.query<{ evidence_count: string }>(
      `
        SELECT COUNT(*)::text AS evidence_count
        FROM evidence_freeze
        WHERE incident_id = $1
      `,
      [incidentId],
    );

    const captureResult = await this.database.pool.query(
      `
        SELECT total_jobs, completed_jobs
        FROM incident_capture_status_view
        WHERE incident_id = $1
      `,
      [incidentId],
    );

    return {
      evidence_count: Number.parseInt(evidenceResult.rows[0]?.evidence_count ?? "0", 10),
      total_jobs: captureResult.rows[0]?.total_jobs ?? 0,
      completed_jobs: captureResult.rows[0]?.completed_jobs ?? 0,
    };
  }

  async fetchSourceLinks(
    targetType: "object" | "alert" | "incident",
    targetId: string,
  ): Promise<Array<{ source_id: string; link_type: string; distance_m: number | null }>> {
    const result = await this.database.pool.query(
      `
        SELECT source_id, link_type, distance_m
        FROM source_links
        WHERE target_type = $1 AND target_id = $2
        ORDER BY created_at DESC
      `,
      [targetType, targetId],
    );

    return result.rows.map((row) => ({
      source_id: row.source_id,
      link_type: row.link_type,
      distance_m: row.distance_m === null ? null : Number(row.distance_m),
    }));
  }

  async fetchNearestSourceToPoint(
    lat: number,
    lon: number,
  ): Promise<{
    source_id: string;
    provider: string;
    label: string;
    lat: number | null;
    lon: number | null;
    distance_m: number;
  } | null> {
    const result = await this.database.pool.query(
      `
        SELECT
          source_id,
          provider,
          label,
          lat,
          lon,
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
      provider: row.provider,
      label: row.label,
      lat: row.lat === null ? null : Number(row.lat),
      lon: row.lon === null ? null : Number(row.lon),
      distance_m: Number(row.distance_m),
    };
  }

  async fetchExternalLayerSummaries(): Promise<
    Array<{
      layer_id: string;
      source_name: string;
      source_url: string | null;
      status: string;
      record_count: number;
      last_fetch_at: string | null;
    }>
  > {
    const result = await this.database.pool.query(
      `
        SELECT layer_id, source_name, source_url, status, record_count, last_fetch_at
        FROM external_data_layers
        ORDER BY layer_id ASC
      `,
    );

    return result.rows.map((row) => ({
      layer_id: row.layer_id,
      source_name: row.source_name,
      source_url: row.source_url ?? null,
      status: row.status,
      record_count: Number(row.record_count ?? 0),
      last_fetch_at: row.last_fetch_at ? new Date(row.last_fetch_at).toISOString() : null,
    }));
  }

  async fetchLayerSummary(layerId: string): Promise<{
    layer_id: string;
    source_name: string;
    source_url: string | null;
    status: string;
    record_count: number;
    error_message: string | null;
  } | null> {
    const result = await this.database.pool.query(
      `
        SELECT layer_id, source_name, source_url, status, record_count, error_message
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
      layer_id: row.layer_id,
      source_name: row.source_name,
      source_url: row.source_url ?? null,
      status: row.status,
      record_count: Number(row.record_count ?? 0),
      error_message: row.error_message ?? null,
    };
  }
}
