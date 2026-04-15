/**
 * Base Agent Worker
 *
 * Abstract base class for all agent types.
 * Provides:
 * - Database and Redis connections
 * - Task polling and claiming
 * - Heartbeat mechanism
 * - Lifecycle management (start/stop)
 *
 * Subclasses implement processTask() to define their specific work.
 */

import {
  AgentCoordinator,
  type AgentEvent,
  AgentEventBus,
} from "../../../packages/agents/src/index.js";
import type { AgentType, TaskEnvelope, TaskType } from "../../../packages/agents/src/protocol.js";
import { createLogger } from "../../../packages/logging/src/index.js";
import {
  createPostgresDatabase,
  type PostgresDatabase,
} from "../../../packages/persistence/src/index.js";

export interface AgentWorkerConfig {
  agentId: string;
  agentType: AgentType;
  agentName: string;
  databaseUrl: string;
  redisUrl: string;
  pollIntervalMs: number;
  claimedTaskTypes: TaskType[];
  heartbeatIntervalMs: number;
}

const DEFAULT_CONFIG: Partial<AgentWorkerConfig> = {
  pollIntervalMs: 5000,
  heartbeatIntervalMs: 30000,
};

export abstract class BaseAgentWorker {
  protected readonly config: AgentWorkerConfig;
  protected readonly logger;
  protected db!: PostgresDatabase;
  protected coordinator!: AgentCoordinator;
  protected eventBus!: AgentEventBus;
  protected running = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(config: AgentWorkerConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config } as AgentWorkerConfig;
    this.logger = createLogger(`agent-${config.agentType}-${config.agentId}`);
  }

  async start(): Promise<void> {
    this.db = createPostgresDatabase({ connection_string: this.config.databaseUrl });
    this.coordinator = new AgentCoordinator({
      db: this.db,
      logger: this.logger,
      agentId: this.config.agentId,
    });
    this.eventBus = new AgentEventBus({
      redisUrl: this.config.redisUrl,
      logger: this.logger,
    });

    await this.eventBus.connect();
    await this.coordinator.registerAgent(
      this.config.agentId,
      this.config.agentType,
      this.config.agentName,
    );

    this.running = true;
    this.startHeartbeat();
    this.startPolling();

    this.logger.info("Agent worker started", {
      agentId: this.config.agentId,
      agentType: this.config.agentType,
      taskTypes: this.config.claimedTaskTypes,
    });
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    await this.eventBus.disconnect();
    await this.db.close();

    this.logger.info("Agent worker stopped", { agentId: this.config.agentId });
  }

  protected startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.coordinator.heartbeat(this.config.agentId);
      } catch (error) {
        this.logger.error("Heartbeat failed", { error });
      }
    }, this.config.heartbeatIntervalMs);
  }

  protected startPolling(): void {
    this.pollTimer = setInterval(async () => {
      if (!this.running) return;
      await this.pollForTasks();
    }, this.config.pollIntervalMs);
  }

  protected async pollForTasks(): Promise<void> {
    try {
      const task = await this.coordinator.claimTask(
        this.config.agentId,
        this.config.claimedTaskTypes,
      );

      if (!task) {
        return;
      }

      this.logger.debug("Task claimed", { taskId: task.taskId, taskType: task.taskType });

      await this.coordinator.startTask(this.config.agentId, task.taskId);

      try {
        const result = await this.processTask(task);
        await this.coordinator.completeTask(this.config.agentId, task.taskId, result ?? undefined);
        this.logger.info("Task completed", { taskId: task.taskId });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await this.coordinator.failTask(this.config.agentId, task.taskId, errorMsg);
        this.logger.error("Task failed", { taskId: task.taskId, error: errorMsg });
      }
    } catch (error) {
      this.logger.error("Poll failed", { error });
    }
  }

  protected abstract processTask(task: TaskEnvelope): Promise<Record<string, unknown> | undefined>;

  protected async publishEvent(
    type: string,
    runId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const event: AgentEvent = {
      type,
      runId,
      timestamp: new Date().toISOString(),
      payload,
    };
    await this.eventBus.publishToAgent(event);
  }
}
