import { randomUUID } from "node:crypto";
import type {
  SwanActivityEvent,
  SwanArtifactProjection,
  SwanFinding,
  SwanProjectionTarget,
  SwanSession,
  SwanThread,
} from "../../contracts/src/index.js";
import {
  SWAN_ACTIVITY_SCHEMA_VERSION,
  SWAN_PROJECTION_TARGETS,
} from "../../contracts/src/index.js";
import type { Logger } from "../../logging/src/index.js";
import type { PostgresDatabase } from "../../persistence/src/index.js";
import { SwanArtifactStore } from "./artifact-store.js";
import type { SwanLiveEvent } from "./live-events.js";
import {
  allowsLiveProjection,
  buildMapProjection,
  buildNotificationsProjection,
  buildPanelsProjection,
  buildSessionProjection,
  buildThreadArtifact,
} from "./projections.js";
import {
  appContextProvider,
  createExternalResearchProvider,
  existingExternalLayersProvider,
  type SwanGeneratedFinding,
  type SwanProvider,
} from "./providers.js";
import { type SwanFindingWrite, SwanRepository } from "./repository.js";

export interface SwanServiceConfig {
  artifactRoot: string;
  maxThreadsPerSession: number;
  maxGlobalThreads: number;
  sessionIdleTtlMs: number;
  watchIntervalMs: number;
  providerAllowlist: string[];
  externalResearchFeeds?: string[];
  tickIntervalMs?: number;
}

export interface SwanSessionResponse {
  session: SwanSession;
  projections: {
    session: SwanArtifactProjection;
    panels: SwanArtifactProjection;
    map: SwanArtifactProjection;
    notifications: SwanArtifactProjection;
  };
}

function isMissingRelationError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "42P01";
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeActivityKey(input: {
  activity_type: SwanActivityEvent["activity_type"];
  target_type?: SwanActivityEvent["target_type"];
  target_id?: string | null;
  mode?: SwanActivityEvent["mode"];
}): string {
  return [
    input.activity_type,
    input.target_type ?? "none",
    input.target_id ?? input.mode ?? "none",
  ].join(":");
}

function getRecipePriority(recipe: SwanThread["recipe"]): number {
  switch (recipe) {
    case "context":
      return 100;
    case "verify":
      return 80;
    case "watch":
      return 75;
    case "window_watch":
      return 70;
    case "research":
      return 65;
    case "layer_watch":
      return 60;
    default:
      return 50;
  }
}

function getThreadDefinitions(
  activity: SwanActivityEvent,
  watchIntervalMs: number,
): Array<{
  recipe: SwanThread["recipe"];
  target_type: SwanThread["target_type"];
  target_id: string | null;
  is_recurring: boolean;
  recurrence_interval_ms: number | null;
}> {
  switch (activity.activity_type) {
    case "object_selected":
      return [
        {
          recipe: "context",
          target_type: activity.target_type,
          target_id: activity.target_id,
          is_recurring: false,
          recurrence_interval_ms: null,
        },
        {
          recipe: "verify",
          target_type: activity.target_type,
          target_id: activity.target_id,
          is_recurring: false,
          recurrence_interval_ms: null,
        },
        {
          recipe: "research",
          target_type: activity.target_type,
          target_id: activity.target_id,
          is_recurring: false,
          recurrence_interval_ms: null,
        },
      ];
    case "alert_opened":
    case "incident_opened":
      return [
        {
          recipe: "context",
          target_type: activity.target_type,
          target_id: activity.target_id,
          is_recurring: false,
          recurrence_interval_ms: null,
        },
        {
          recipe: "watch",
          target_type: activity.target_type,
          target_id: activity.target_id,
          is_recurring: true,
          recurrence_interval_ms: watchIntervalMs,
        },
        {
          recipe: "research",
          target_type: activity.target_type,
          target_id: activity.target_id,
          is_recurring: false,
          recurrence_interval_ms: null,
        },
      ];
    case "mode_switched":
    case "replay_query_submitted":
      return [
        {
          recipe: "window_watch",
          target_type: activity.target_type,
          target_id: activity.target_id,
          is_recurring: true,
          recurrence_interval_ms: watchIntervalMs,
        },
        {
          recipe: "research",
          target_type: activity.target_type,
          target_id: activity.target_id,
          is_recurring: false,
          recurrence_interval_ms: null,
        },
      ];
    case "layer_toggled":
      if (activity.context.enabled !== true) {
        return [];
      }

      return [
        {
          recipe: "layer_watch",
          target_type: activity.target_type,
          target_id: activity.target_id,
          is_recurring: true,
          recurrence_interval_ms: watchIntervalMs,
        },
      ];
    default:
      return [];
  }
}

export class SwanProtocolService {
  private readonly repository: SwanRepository;
  private readonly artifactStore: SwanArtifactStore;
  private readonly providers = new Map<string, SwanProvider>();
  private readonly runningThreadIds = new Set<string>();
  private readonly runningBySession = new Map<string, number>();
  private readonly cancelledThreadIds = new Set<string>();
  private readonly schedulerInterval: NodeJS.Timeout;
  private readonly recurringInterval: NodeJS.Timeout;
  private readonly expiryInterval: NodeJS.Timeout;
  private schemaUnavailable = false;

  constructor(
    database: PostgresDatabase,
    private readonly logger: Logger,
    private readonly config: SwanServiceConfig,
    private readonly publishLiveEvent: (event: SwanLiveEvent) => void,
  ) {
    this.repository = new SwanRepository(database);
    this.artifactStore = new SwanArtifactStore(config.artifactRoot);
    this.providers.set("app_context", appContextProvider);
    this.providers.set("existing_external_layers", existingExternalLayersProvider);
    this.providers.set(
      "external_research",
      createExternalResearchProvider({
        logger,
        externalResearchFeeds: config.externalResearchFeeds ?? [],
      }),
    );

    this.schedulerInterval = setInterval(() => {
      void this.runBackgroundTask("drainQueue", () => this.drainQueue());
    }, config.tickIntervalMs ?? 250);
    this.recurringInterval = setInterval(
      () => {
        void this.runBackgroundTask("queueDueRecurringThreads", () =>
          this.repository.queueDueRecurringThreads(),
        );
      },
      Math.max(1000, Math.min(config.watchIntervalMs, 5000)),
    );
    this.expiryInterval = setInterval(() => {
      void this.runBackgroundTask("expireIdleSessions", () => this.expireIdleSessions());
    }, 10000);
  }

  async close(): Promise<void> {
    clearInterval(this.schedulerInterval);
    clearInterval(this.recurringInterval);
    clearInterval(this.expiryInterval);
  }

  private async runBackgroundTask(operation: string, run: () => Promise<unknown>): Promise<void> {
    if (this.schemaUnavailable) {
      return;
    }

    try {
      await run();
    } catch (error) {
      if (isMissingRelationError(error)) {
        this.schemaUnavailable = true;
        this.logger.warn("SWAN background service paused because schema is unavailable", {
          operation,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }

      this.logger.warn("SWAN background task failed", {
        operation,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private emit(event: SwanLiveEvent): void {
    this.publishLiveEvent({
      ...event,
      timestamp: nowIso(),
    });
  }

  private getProviderNamesForRecipe(recipe: SwanThread["recipe"]): string[] {
    switch (recipe) {
      case "context":
        return ["app_context", "existing_external_layers"];
      case "verify":
        return ["app_context", "existing_external_layers"];
      case "research":
        return ["external_research", "existing_external_layers"];
      case "watch":
      case "window_watch":
      case "layer_watch":
        return ["app_context", "existing_external_layers", "external_research"];
      default:
        return ["app_context"];
    }
  }

  private async writeProjectionArtifact(
    sessionId: string,
    artifactKey: string,
    projection: SwanArtifactProjection,
  ): Promise<void> {
    const artifact = this.artifactStore.prepareArtifact(sessionId, artifactKey, projection);
    await this.repository.upsertArtifact({
      artifact_id: `${sessionId}:${artifactKey}`,
      session_id: sessionId,
      artifact_key: artifactKey,
      projection: projection.projection,
      file_path: artifact.file_path,
      checksum: artifact.checksum,
      generated_at: projection.generated_at,
    });
    await this.artifactStore.materializeArtifact(artifact);

    this.emit({
      type: "swan_projection_update",
      timestamp: projection.generated_at,
      payload: {
        session_id: sessionId,
        projection: projection.projection,
        artifact_key: artifactKey,
        generated_at: projection.generated_at,
      },
    });
  }

  private async writeThreadArtifact(thread: SwanThread): Promise<void> {
    const findings = await this.repository.listFindingsForThread(thread.thread_id);
    const generatedAt = nowIso();
    const artifactKey = `threads/${thread.thread_id}`;
    const artifact = this.artifactStore.prepareArtifact(
      thread.session_id,
      artifactKey,
      buildThreadArtifact(thread, findings),
    );

    await this.repository.upsertArtifact({
      artifact_id: `${thread.session_id}:${artifactKey}`,
      session_id: thread.session_id,
      artifact_key: artifactKey,
      projection: "thread",
      file_path: artifact.file_path,
      checksum: artifact.checksum,
      generated_at: generatedAt,
    });
    await this.artifactStore.materializeArtifact(artifact);

    this.emit({
      type: "swan_projection_update",
      timestamp: generatedAt,
      payload: {
        session_id: thread.session_id,
        projection: "thread",
        artifact_key: artifactKey,
        generated_at: generatedAt,
      },
    });
  }

  private async refreshSessionArtifacts(sessionId: string): Promise<SwanSessionResponse> {
    const session = await this.repository.getSession(sessionId);
    if (!session) {
      throw new Error(`Swan session ${sessionId} not found`);
    }

    const [threads, findings] = await Promise.all([
      this.repository.listThreadsForSession(sessionId),
      this.repository.listFindingsForSession(sessionId),
    ]);

    const sessionProjection = buildSessionProjection(session, threads);
    const panelsProjection = buildPanelsProjection(sessionId, findings);
    const mapProjection = buildMapProjection(sessionId, findings);
    const notificationsProjection = buildNotificationsProjection(sessionId, findings);

    await this.writeProjectionArtifact(sessionId, "session", sessionProjection);
    await this.writeProjectionArtifact(sessionId, "panels", panelsProjection);
    await this.writeProjectionArtifact(sessionId, "map", mapProjection);
    await this.writeProjectionArtifact(sessionId, "notifications", notificationsProjection);
    await this.repository.setSessionProjectionTime(sessionId, sessionProjection.generated_at);

    this.emit({
      type: "swan_session_update",
      timestamp: sessionProjection.generated_at,
      payload: {
        session_id: sessionId,
        status: session.status,
        last_activity_at: session.last_activity_at,
        last_projection_at: sessionProjection.generated_at,
        active_thread_count: this.runningBySession.get(sessionId) ?? 0,
      },
    });

    return {
      session: {
        ...session,
        last_projection_at: sessionProjection.generated_at,
      },
      projections: {
        session: sessionProjection,
        panels: panelsProjection,
        map: mapProjection,
        notifications: notificationsProjection,
      },
    };
  }

  private async expireIdleSessions(): Promise<void> {
    const cutoffIso = new Date(Date.now() - this.config.sessionIdleTtlMs).toISOString();
    const expiredSessions = await this.repository.expireIdleSessions(cutoffIso);

    for (const session of expiredSessions) {
      const cancelledIds = await this.repository.cancelThreadsForSession(session.session_id);
      for (const threadId of cancelledIds) {
        this.cancelledThreadIds.add(threadId);
      }
      await this.refreshSessionArtifacts(session.session_id);
    }
  }

  async enableSession(input: {
    user_id: string;
    client_session_id: string;
    context: Record<string, unknown>;
  }): Promise<SwanSessionResponse> {
    const occurredAt = nowIso();
    const session = await this.repository.upsertSession({
      session_id: randomUUID(),
      client_session_id: input.client_session_id,
      user_id: input.user_id,
      current_context: input.context,
      occurred_at: occurredAt,
    });

    const activityKey = "session_enabled:session:enabled";
    const hasActivity = await this.repository.hasRecentActivity(
      session.session_id,
      activityKey,
      new Date(Date.now() - 2000).toISOString(),
    );

    if (!hasActivity) {
      await this.repository.insertActivity({
        activity_id: randomUUID(),
        session_id: session.session_id,
        client_session_id: session.client_session_id,
        user_id: session.user_id,
        activity_type: "session_enabled",
        target_type: "session",
        target_id: "enabled",
        route: typeof input.context.route === "string" ? input.context.route : null,
        mode:
          input.context.mode === "live" || input.context.mode === "replay"
            ? input.context.mode
            : null,
        activity_key: activityKey,
        context: input.context,
        occurred_at: occurredAt,
      });
    }

    return this.refreshSessionArtifacts(session.session_id);
  }

  async getSessionByClient(
    userId: string,
    clientSessionId: string,
  ): Promise<SwanSessionResponse | null> {
    const session = await this.repository.getSessionByClientSession(userId, clientSessionId);
    if (!session || session.status !== "active") {
      return null;
    }

    return this.refreshSessionArtifacts(session.session_id);
  }

  async disableSession(userId: string, clientSessionId: string): Promise<void> {
    const session = await this.repository.getSessionByClientSession(userId, clientSessionId);
    if (!session) {
      return;
    }

    await this.repository.insertActivity({
      activity_id: randomUUID(),
      session_id: session.session_id,
      client_session_id: session.client_session_id,
      user_id: session.user_id,
      activity_type: "session_disabled",
      target_type: "session",
      target_id: "disabled",
      route: null,
      mode: null,
      activity_key: "session_disabled:session:disabled",
      context: session.current_context,
      occurred_at: nowIso(),
    });

    const cancelledIds = await this.repository.cancelThreadsForSession(session.session_id);
    for (const threadId of cancelledIds) {
      this.cancelledThreadIds.add(threadId);
    }

    await this.repository.disableSession(session.session_id, "disabled", nowIso());
    await this.refreshSessionArtifacts(session.session_id);
  }

  async recordActivity(input: {
    user_id: string;
    client_session_id: string;
    activity_type: SwanActivityEvent["activity_type"];
    target_type: SwanActivityEvent["target_type"];
    target_id: string | null;
    route: string | null;
    mode: SwanActivityEvent["mode"];
    context: Record<string, unknown>;
  }): Promise<{
    session: SwanSession;
    activity: SwanActivityEvent | null;
    scheduled_threads: SwanThread[];
  }> {
    const session = await this.repository.getSessionByClientSession(
      input.user_id,
      input.client_session_id,
    );
    if (!session || session.status !== "active") {
      throw new Error("Swan session is not active");
    }

    const occurredAt = nowIso();
    const activityKey =
      typeof input.context.activity_key === "string"
        ? input.context.activity_key
        : makeActivityKey(input);

    const isDuplicate = await this.repository.hasRecentActivity(
      session.session_id,
      activityKey,
      new Date(Date.now() - 2000).toISOString(),
    );

    const nextContext = {
      ...session.current_context,
      ...input.context,
      last_activity_type: input.activity_type,
      last_target_type: input.target_type,
      last_target_id: input.target_id,
      mode: input.mode ?? session.current_context.mode ?? null,
      route: input.route ?? session.current_context.route ?? null,
    };

    const updatedSession = await this.repository.updateSessionContext(
      session.session_id,
      nextContext,
      occurredAt,
    );

    let activity: SwanActivityEvent | null = null;
    if (!isDuplicate) {
      activity = await this.repository.insertActivity({
        activity_id: randomUUID(),
        session_id: session.session_id,
        client_session_id: session.client_session_id,
        user_id: session.user_id,
        activity_type: input.activity_type,
        target_type: input.target_type,
        target_id: input.target_id,
        route: input.route,
        mode: input.mode,
        activity_key: activityKey,
        context: nextContext,
        occurred_at: occurredAt,
      });
    }

    if (
      input.activity_type === "layer_toggled" &&
      input.context.enabled === false &&
      input.target_id
    ) {
      const cancelledIds = await this.repository.cancelThreadByDedupeKey(
        session.session_id,
        `layer_watch:${input.target_type ?? "unknown"}:${input.target_id}`,
      );
      for (const threadId of cancelledIds) {
        this.cancelledThreadIds.add(threadId);
      }

      return {
        session: updatedSession,
        activity,
        scheduled_threads: [],
      };
    }

    if (
      input.target_type &&
      input.target_id &&
      (input.activity_type === "object_selected" ||
        input.activity_type === "alert_opened" ||
        input.activity_type === "incident_opened")
    ) {
      const cancelledIds = await this.repository.cancelThreadsForTargetReplacement(
        session.session_id,
        input.target_type,
        input.target_id,
      );
      for (const threadId of cancelledIds) {
        this.cancelledThreadIds.add(threadId);
      }
    }

    const threadDefinitions = isDuplicate
      ? []
      : getThreadDefinitions(
          {
            schema_version: SWAN_ACTIVITY_SCHEMA_VERSION,
            activity_id: "transient",
            session_id: session.session_id,
            client_session_id: session.client_session_id,
            user_id: session.user_id,
            activity_type: input.activity_type,
            target_type: input.target_type,
            target_id: input.target_id,
            route: input.route,
            mode: input.mode,
            activity_key: activityKey,
            context: nextContext,
            occurred_at: occurredAt,
          },
          this.config.watchIntervalMs,
        );

    const existingSessionThreads = await this.repository.listThreadsForSession(session.session_id);
    const activeThreadCount = existingSessionThreads.filter(
      (thread) => thread.status !== "cancelled",
    ).length;
    const availableSlots = Math.max(0, this.config.maxThreadsPerSession - activeThreadCount);
    const scheduledThreads: SwanThread[] = [];

    for (const threadDefinition of threadDefinitions.slice(0, availableSlots)) {
      const dedupeKey = `${threadDefinition.recipe}:${threadDefinition.target_type ?? "unknown"}:${threadDefinition.target_id ?? "none"}`;
      const thread = await this.repository.upsertThread({
        thread_id: randomUUID(),
        session_id: session.session_id,
        recipe: threadDefinition.recipe,
        target_type: threadDefinition.target_type,
        target_id: threadDefinition.target_id,
        status: "queued",
        priority: getRecipePriority(threadDefinition.recipe),
        dedupe_key: dedupeKey,
        is_recurring: threadDefinition.is_recurring,
        recurrence_interval_ms: threadDefinition.recurrence_interval_ms,
        queued_at: occurredAt,
        next_run_at: null,
        context: nextContext,
      });

      scheduledThreads.push(thread);
      await this.writeThreadArtifact(thread);
      this.emit({
        type: "swan_thread_update",
        timestamp: occurredAt,
        payload: {
          session_id: thread.session_id,
          thread_id: thread.thread_id,
          recipe: thread.recipe,
          status: thread.status,
          target_type: thread.target_type,
          target_id: thread.target_id,
          updated_at: thread.updated_at,
          error_message: thread.error_message,
        },
      });
    }

    return {
      session: updatedSession,
      activity,
      scheduled_threads: scheduledThreads,
    };
  }

  private async drainQueue(): Promise<void> {
    if (this.runningThreadIds.size >= this.config.maxGlobalThreads) {
      return;
    }

    const runnableThreads = await this.repository.listRunnableThreads(
      this.config.maxGlobalThreads - this.runningThreadIds.size,
    );
    if (runnableThreads.length === 0) {
      return;
    }

    for (const thread of runnableThreads) {
      const sessionCount = this.runningBySession.get(thread.session_id) ?? 0;
      if (sessionCount >= this.config.maxThreadsPerSession) {
        continue;
      }
      if (this.runningThreadIds.has(thread.thread_id)) {
        continue;
      }

      this.runningThreadIds.add(thread.thread_id);
      this.runningBySession.set(thread.session_id, sessionCount + 1);
      void this.executeThread(thread);
    }
  }

  private async executeThread(thread: SwanThread): Promise<void> {
    let finalizedSessionId = thread.session_id;

    try {
      const runningThread = await this.repository.markThreadRunning(thread.thread_id, nowIso());
      finalizedSessionId = runningThread.session_id;

      this.emit({
        type: "swan_thread_update",
        timestamp: nowIso(),
        payload: {
          session_id: runningThread.session_id,
          thread_id: runningThread.thread_id,
          recipe: runningThread.recipe,
          status: runningThread.status,
          target_type: runningThread.target_type,
          target_id: runningThread.target_id,
          updated_at: runningThread.updated_at,
          error_message: runningThread.error_message,
        },
      });

      if (this.cancelledThreadIds.has(runningThread.thread_id)) {
        await this.repository.finalizeThread({
          thread_id: runningThread.thread_id,
          status: "cancelled",
          completed_at: nowIso(),
          next_run_at: null,
        });
        return;
      }

      const session = await this.repository.getSession(runningThread.session_id);
      if (!session || session.status !== "active") {
        await this.repository.finalizeThread({
          thread_id: runningThread.thread_id,
          status: "cancelled",
          completed_at: nowIso(),
          next_run_at: null,
        });
        return;
      }

      const providerNames = this.getProviderNamesForRecipe(runningThread.recipe).filter(
        (providerName) => this.config.providerAllowlist.includes(providerName),
      );

      const generatedFindings: SwanGeneratedFinding[] = [];
      for (const providerName of providerNames) {
        if (this.cancelledThreadIds.has(runningThread.thread_id)) {
          break;
        }

        const provider = this.providers.get(providerName);
        if (!provider) {
          continue;
        }

        const findings = await provider({
          session,
          thread: runningThread,
          repository: this.repository,
        });
        generatedFindings.push(...findings);
      }

      if (this.cancelledThreadIds.has(runningThread.thread_id)) {
        await this.repository.finalizeThread({
          thread_id: runningThread.thread_id,
          status: "cancelled",
          completed_at: nowIso(),
          next_run_at: null,
        });
        return;
      }

      const generatedAt = nowIso();
      const findingWrites: SwanFindingWrite[] = generatedFindings.map((finding) => ({
        finding_id: randomUUID(),
        session_id: runningThread.session_id,
        thread_id: runningThread.thread_id,
        provider: finding.provider,
        target_type: finding.target_type,
        target_id: finding.target_id,
        finding_kind: finding.finding_kind,
        title: finding.title,
        summary: finding.summary,
        details: finding.details,
        verification_status: finding.verification_status,
        confidence: finding.confidence,
        projection_targets: finding.projection_targets.filter((target) =>
          SWAN_PROJECTION_TARGETS.includes(target),
        ) as SwanProjectionTarget[],
        source_urls: finding.source_urls,
        media: finding.media,
        lat: finding.lat,
        lon: finding.lon,
        generated_at: generatedAt,
        updated_at: generatedAt,
      }));

      const persistedFindings = await this.repository.replaceFindingsForThread(
        runningThread.thread_id,
        runningThread.session_id,
        findingWrites,
      );

      const finalizedThread = await this.repository.finalizeThread({
        thread_id: runningThread.thread_id,
        status: "completed",
        completed_at: generatedAt,
        next_run_at:
          runningThread.is_recurring && runningThread.recurrence_interval_ms
            ? new Date(Date.now() + runningThread.recurrence_interval_ms).toISOString()
            : null,
      });

      await this.writeThreadArtifact(finalizedThread);
      await this.refreshSessionArtifacts(runningThread.session_id);

      this.emit({
        type: "swan_thread_update",
        timestamp: generatedAt,
        payload: {
          session_id: finalizedThread.session_id,
          thread_id: finalizedThread.thread_id,
          recipe: finalizedThread.recipe,
          status: finalizedThread.status,
          target_type: finalizedThread.target_type,
          target_id: finalizedThread.target_id,
          updated_at: finalizedThread.updated_at,
          error_message: finalizedThread.error_message,
        },
      });

      for (const finding of persistedFindings) {
        if (
          finding.projection_targets.includes("notification") &&
          allowsLiveProjection(finding.verification_status)
        ) {
          this.emit({
            type: "swan_notification",
            timestamp: finding.generated_at,
            payload: {
              session_id: runningThread.session_id,
              notification: {
                finding_id: finding.finding_id,
                target_type: finding.target_type,
                target_id: finding.target_id,
                title: finding.title,
                summary: finding.summary,
                verification_status: finding.verification_status,
                generated_at: finding.generated_at,
              },
            },
          });
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error("Swan thread execution failed", {
        thread_id: thread.thread_id,
        error: message,
      });

      const failedThread = await this.repository.finalizeThread({
        thread_id: thread.thread_id,
        status: "failed",
        completed_at: nowIso(),
        next_run_at:
          thread.is_recurring && thread.recurrence_interval_ms
            ? new Date(Date.now() + thread.recurrence_interval_ms).toISOString()
            : null,
        error_message: message,
      });

      await this.writeThreadArtifact(failedThread);
      this.emit({
        type: "swan_thread_update",
        timestamp: nowIso(),
        payload: {
          session_id: failedThread.session_id,
          thread_id: failedThread.thread_id,
          recipe: failedThread.recipe,
          status: failedThread.status,
          target_type: failedThread.target_type,
          target_id: failedThread.target_id,
          updated_at: failedThread.updated_at,
          error_message: failedThread.error_message,
        },
      });
    } finally {
      this.runningThreadIds.delete(thread.thread_id);
      this.cancelledThreadIds.delete(thread.thread_id);
      const current = this.runningBySession.get(finalizedSessionId) ?? 1;
      this.runningBySession.set(finalizedSessionId, Math.max(0, current - 1));
    }
  }

  async listFindings(input: {
    user_id: string;
    client_session_id: string;
    target_type?: SwanFinding["target_type"];
    target_id?: string;
    verification_status?: SwanFinding["verification_status"];
    limit?: number;
  }): Promise<SwanFinding[]> {
    const session = await this.repository.getSessionByClientSession(
      input.user_id,
      input.client_session_id,
    );
    if (!session) {
      return [];
    }

    return this.repository.listFindings({
      session_id: session.session_id,
      target_type: input.target_type,
      target_id: input.target_id,
      verification_status: input.verification_status,
      limit: input.limit,
    });
  }

  async readArtifact(
    userId: string,
    sessionId: string,
    artifactKey: string,
  ): Promise<unknown | null> {
    const session = await this.repository.getSession(sessionId);
    if (!session || session.user_id !== userId) {
      return null;
    }

    const artifact = await this.repository.getArtifact(sessionId, artifactKey);
    if (!artifact) {
      return null;
    }

    return this.artifactStore.readArtifact(artifact.file_path);
  }
}
