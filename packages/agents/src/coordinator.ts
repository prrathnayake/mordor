/**
 * Agent Coordinator
 *
 * Manages the agent swarm by:
 * - Registering agents
 * - Creating and routing tasks
 * - Managing locks to prevent duplicate work
 * - Handling task lifecycle (claim, start, complete, fail)
 *
 * Uses database-level locking (FOR UPDATE SKIP LOCKED) for atomic operations.
 */

import { randomUUID } from "node:crypto";
import type { Logger } from "../../logging/src/index.js";
import type { PostgresDatabase } from "../../persistence/src/index.js";
import type {
  AgentId,
  AgentType,
  EntityId,
  Priority,
  TaskEnvelope,
  TaskId,
  TaskStatus,
  TaskType,
} from "./protocol.js";

export interface CoordinatorConfig {
  maxConcurrentTasks: number;
  taskTimeoutMs: number;
  lockTtlMs: number;
  dedupeWindowMs: number;
}

const DEFAULT_CONFIG: CoordinatorConfig = {
  maxConcurrentTasks: 10,
  taskTimeoutMs: 30000,
  lockTtlMs: 30000,
  dedupeWindowMs: 60000,
};

export class AgentCoordinator {
  private readonly db: PostgresDatabase;
  private readonly logger: Logger;
  private readonly config: CoordinatorConfig;
  private readonly agentId: AgentId;

  constructor(input: {
    db: PostgresDatabase;
    logger: Logger;
    agentId?: string;
    config?: Partial<CoordinatorConfig>;
  }) {
    this.db = input.db;
    this.logger = input.logger;
    this.agentId = input.agentId ?? `coordinator_${randomUUID().slice(0, 8)}`;
    this.config = { ...DEFAULT_CONFIG, ...input.config };
  }

  async registerAgent(agentId: AgentId, agentType: AgentType, name: string): Promise<void> {
    await this.db.pool.query(
      `INSERT INTO agent_configs (agent_id, agent_type, name, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (agent_id) DO UPDATE SET status = 'active', updated_at = NOW()`,
      [agentId, agentType, name],
    );
    this.logger.debug("Agent registered", { agentId, agentType, name });
  }

  async createTask(input: {
    taskType: TaskType;
    priority?: Priority;
    source: string;
    targetEntityIds: EntityId[];
    payload: Record<string, unknown>;
    parentTaskId?: TaskId;
    dedupeKey?: string;
    deadlineMs?: number;
    runId?: string;
  }): Promise<TaskId> {
    const taskId: TaskId = `task_${randomUUID()}`;
    const runId = input.runId ?? `run_${Date.now()}`;
    const priority = input.priority ?? "medium";
    const deadlineMs = input.deadlineMs ?? this.config.taskTimeoutMs;

    const payloadStr = JSON.stringify(input.payload);
    const constraintsStr = JSON.stringify({
      deadlineMs,
      maxRetries: 2,
      lockTtlMs: this.config.lockTtlMs,
    });

    await this.db.pool.query(
      `INSERT INTO agent_tasks (
        task_id, run_id, parent_task_id, task_type, priority, source,
        target_entity_ids, status, payload, constraints, dedupe_key, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', $8, $9, $10, NOW())`,
      [
        taskId,
        runId,
        input.parentTaskId ?? null,
        input.taskType,
        priority,
        input.source,
        input.targetEntityIds,
        payloadStr,
        constraintsStr,
        input.dedupeKey ?? null,
      ],
    );

    await this.emitEvent(runId, "task.created", { taskId, taskType: input.taskType });

    return taskId;
  }

  async claimTask(agentId: AgentId, taskTypes: TaskType[]): Promise<TaskEnvelope | null> {
    const typeList = taskTypes.join(",");

    const result = await this.db.pool.query(
      `SELECT task_id FROM agent_tasks
       WHERE status = 'queued'
         AND task_type = ANY(STRING_TO_ARRAY($1, ',')::text[])
         AND (dedupe_key IS NULL OR NOT EXISTS (
           SELECT 1 FROM agent_tasks t2
           WHERE t2.dedupe_key = agent_tasks.dedupe_key
             AND t2.status IN ('claimed', 'running')
             AND t2.created_at > NOW() - INTERVAL '60 seconds'
         ))
       ORDER BY
         CASE priority
           WHEN 'critical' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 4
         END,
         created_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [typeList],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const taskId = result.rows[0].task_id as TaskId;

    await this.db.pool.query(
      `UPDATE agent_tasks SET status = 'claimed', assigned_agent = $1, claimed_at = NOW() WHERE task_id = $2`,
      [agentId, taskId],
    );

    const task = await this.getTask(taskId);
    if (task) {
      await this.emitEvent(task.runId, "task.claimed", { taskId, agentId });
    }

    return task;
  }

  async startTask(agentId: AgentId, taskId: TaskId): Promise<void> {
    await this.db.pool.query(
      `UPDATE agent_tasks SET status = 'running', started_at = NOW() WHERE task_id = $1 AND assigned_agent = $2`,
      [taskId, agentId],
    );

    const task = await this.getTask(taskId);
    if (task) {
      await this.emitEvent(task.runId, "task.started", { taskId, agentId });
    }
  }

  async completeTask(
    agentId: AgentId,
    taskId: TaskId,
    result?: Record<string, unknown>,
  ): Promise<void> {
    const resultStr = result ? JSON.stringify(result) : "{}";
    await this.db.pool.query(
      `UPDATE agent_tasks
       SET status = 'completed', completed_at = NOW(), payload = COALESCE(payload, '{}'::jsonb) || $1
       WHERE task_id = $2 AND assigned_agent = $3`,
      [resultStr, taskId, agentId],
    );

    const task = await this.getTask(taskId);
    if (task) {
      await this.emitEvent(task.runId, "task.completed", { taskId, agentId, result });
    }
  }

  async failTask(
    _agentId: AgentId,
    taskId: TaskId,
    error: string,
    retryable = true,
  ): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) return;

    const constraints = task.payload as unknown as { maxRetries?: number };
    const maxRetries = constraints?.maxRetries ?? 2;

    if (retryable && (task.retryCount ?? 0) < maxRetries) {
      await this.db.pool.query(
        `UPDATE agent_tasks SET status = 'queued', retry_count = retry_count + 1, error = NULL WHERE task_id = $1`,
        [taskId],
      );
      await this.emitEvent(task.runId, "task.retried", {
        taskId,
        retryCount: (task.retryCount ?? 0) + 1,
      });
    } else {
      await this.db.pool.query(
        `UPDATE agent_tasks SET status = 'failed', completed_at = NOW(), error = $1 WHERE task_id = $2`,
        [error, taskId],
      );
      await this.emitEvent(task.runId, "task.failed", { taskId, error });
    }
  }

  async acquireLock(
    agentId: AgentId,
    resourceType: string,
    resourceId: string,
    taskId?: TaskId,
  ): Promise<boolean> {
    const lockId = `lock_${randomUUID()}`;
    const expiresAt = new Date(Date.now() + this.config.lockTtlMs);

    try {
      await this.db.pool.query(
        `INSERT INTO agent_locks (lock_id, resource_type, resource_id, agent_id, task_id, status, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'active', $6)`,
        [lockId, resourceType, resourceId, agentId, taskId ?? null, expiresAt],
      );
      return true;
    } catch {
      const existing = await this.db.pool.query(
        `SELECT agent_id, expires_at FROM agent_locks
         WHERE resource_type = $1 AND resource_id = $2
           AND status = 'active' AND expires_at > NOW()
         FOR UPDATE SKIP LOCKED`,
        [resourceType, resourceId],
      );

      if (existing.rows.length === 0) {
        return this.acquireLock(agentId, resourceId, resourceType, taskId);
      }

      return false;
    }
  }

  async releaseLock(agentId: AgentId, resourceType: string, resourceId: string): Promise<void> {
    await this.db.pool.query(
      `UPDATE agent_locks SET status = 'released'
       WHERE resource_type = $1 AND resource_id = $2 AND agent_id = $3 AND status = 'active'`,
      [resourceType, resourceId, agentId],
    );
  }

  async heartbeat(agentId: AgentId): Promise<void> {
    await this.db.pool.query(
      `UPDATE agent_configs SET last_heartbeat_at = NOW() WHERE agent_id = $1`,
      [agentId],
    );
  }

  async getTask(taskId: TaskId): Promise<TaskEnvelope | null> {
    const result = await this.db.pool.query(`SELECT * FROM agent_tasks WHERE task_id = $1`, [
      taskId,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as Record<string, unknown>;
    const constraints = (row.constraints as Record<string, unknown>) ?? {};
    return {
      taskId: row.task_id as TaskId,
      runId: row.run_id as string,
      parentTaskId: row.parent_task_id as TaskId | null,
      taskType: row.task_type as TaskType,
      priority: row.priority as Priority,
      source: row.source as string,
      targetEntityIds: row.target_entity_ids as EntityId[],
      assignedAgent: row.assigned_agent as AgentId | null,
      status: row.status as TaskStatus,
      payload: row.payload as Record<string, unknown>,
      constraints: {
        deadlineMs: (constraints.deadlineMs as number) ?? 30000,
        maxRetries: (constraints.maxRetries as number) ?? 2,
        lockTtlMs: constraints.lockTtlMs as number,
      },
      createdAt: (row.created_at as Date).toISOString(),
      claimedAt: row.claimed_at ? (row.claimed_at as Date).toISOString() : null,
      startedAt: row.started_at ? (row.started_at as Date).toISOString() : null,
      completedAt: row.completed_at ? (row.completed_at as Date).toISOString() : null,
      error: row.error as string | null,
      retryCount: (row.retry_count as number) ?? 0,
      dedupeKey: row.dedupe_key as string | null,
    };
  }

  async listTasksByStatus(status: TaskStatus): Promise<TaskEnvelope[]> {
    const result = await this.db.pool.query(
      `SELECT * FROM agent_tasks WHERE status = $1 ORDER BY created_at DESC LIMIT 100`,
      [status],
    );

    return result.rows.map((row) => {
      const r = row as Record<string, unknown>;
      const constraints = (r.constraints as Record<string, unknown>) ?? {};
      return {
        taskId: r.task_id as TaskId,
        runId: r.run_id as string,
        parentTaskId: r.parent_task_id as TaskId | null,
        taskType: r.task_type as TaskType,
        priority: r.priority as Priority,
        source: r.source as string,
        targetEntityIds: r.target_entity_ids as EntityId[],
        assignedAgent: r.assigned_agent as AgentId | null,
        status: r.status as TaskStatus,
        payload: r.payload as Record<string, unknown>,
        constraints: {
          deadlineMs: (constraints.deadlineMs as number) ?? 30000,
          maxRetries: (constraints.maxRetries as number) ?? 2,
          lockTtlMs: constraints.lockTtlMs as number,
        },
        createdAt: (r.created_at as Date).toISOString(),
        claimedAt: r.claimed_at ? (r.claimed_at as Date).toISOString() : null,
        startedAt: r.started_at ? (r.started_at as Date).toISOString() : null,
        completedAt: r.completed_at ? (r.completed_at as Date).toISOString() : null,
        error: r.error as string | null,
        retryCount: (r.retry_count as number) ?? 0,
        dedupeKey: r.dedupe_key as string | null,
      };
    });
  }

  private async emitEvent(
    runId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const eventId = `evt_${randomUUID()}`;
    const payloadStr = JSON.stringify(payload);
    await this.db.pool.query(
      `INSERT INTO agent_events (event_id, run_id, event_type, source_agent, payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [eventId, runId, eventType, this.agentId, payloadStr],
    );
  }

  getAgentId(): AgentId {
    return this.agentId;
  }
}
