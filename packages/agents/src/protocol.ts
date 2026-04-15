/**
 * Agent Protocol Type Definitions
 *
 * This module defines the core types for the agent swarm system.
 * All agents communicate through structured tasks and events.
 */

/** Unique identifier for an agent instance */
export type AgentId = string;

/** Unique identifier for a task */
export type TaskId = string;

/** Unique identifier for a run (session of work) */
export type RunId = string;

/** Unique identifier for an entity (flight, object, alert, etc.) */
export type EntityId = string;

/** Classification of agent roles in the swarm */
export type AgentType =
  | "collector" // Gathers raw data from sources
  | "detector" // Finds anomalies using statistical methods
  | "correlator" // Links related entities/events
  | "enrichment" // Adds context from external sources
  | "coordinator" // Routes tasks, manages locks
  | "publisher"; // Creates UI-visible alerts

/** Types of work that can be assigned to agents */
export type TaskType =
  | "collect" // Raw data collection
  | "detect_anomaly" // Anomaly detection
  | "detect_correlation" // Event correlation
  | "enrich" // Context enrichment
  | "publish" // UI notification
  | "escalate"; // Escalate to higher authority

/** Lifecycle state of a task */
export type TaskStatus =
  | "queued" // Awaiting assignment
  | "claimed" // Assigned to agent
  | "running" // Currently executing
  | "blocked" // Waiting on dependency
  | "completed" // Finished successfully
  | "failed" // Failed with error
  | "discarded" // Cancelled
  | "escalated"; // Escalated to coordinator

/** Progression state of an insight/alert */
export type EventStatus =
  | "candidate" // Initial detection
  | "suppressed" // Below threshold or duplicate
  | "validated" // Confirmed by rules
  | "correlated" // Linked to other events
  | "approved" // Cleared for publication
  | "published" // Visible in UI
  | "acknowledged" // Operator has seen it
  | "resolved" // Addressed/closed
  | "expired"; // Past TTL

/** Priority levels for task scheduling */
export type Priority = "low" | "medium" | "high" | "critical";

/** Supported entity types in the system */
export type EntityType =
  | "flight"
  | "satellite"
  | "earthquake"
  | "traffic_segment"
  | "weather_cell"
  | "incident"
  | "anomaly"
  | "signal"
  | "object"
  | "alert";

/** Constraints applied to task execution */
export interface TaskConstraints {
  /** Maximum time before task is considered stuck */
  deadlineMs: number;
  /** Number of retry attempts allowed */
  maxRetries: number;
  /** Duration of resource lock in milliseconds */
  lockTtlMs?: number;
}

/**
 * Task Envelope - the fundamental unit of work in the agent system
 *
 * All tasks follow this structure regardless of type.
 * The coordinator uses these fields for routing and scheduling.
 */
export interface TaskEnvelope {
  taskId: TaskId;
  runId: RunId;
  parentTaskId: TaskId | null;
  taskType: TaskType;
  priority: Priority;
  source: string;
  targetEntityIds: EntityId[];
  assignedAgent: AgentId | null;
  status: TaskStatus;
  payload: Record<string, unknown>;
  constraints: TaskConstraints;
  createdAt: string;
  claimedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  retryCount: number;
  dedupeKey: string | null;
}

/**
 * Observation - raw normalized data from collectors
 *
 * Collectors normalize incoming data into this format
 * so detectors can process without knowing source details.
 */
export interface Observation {
  id: string;
  source: string;
  entityType: EntityType;
  entityId: EntityId;
  timestamp: string;
  data: Record<string, unknown>;
  location: { lat: number; lon: number } | null;
  confidence: number;
  metadata: Record<string, unknown>;
}

/**
 * Hypothesis - detected pattern from analyzers
 *
 * Represents a theory about what might be happening.
 * Multiple detectors may produce hypotheses that need correlation.
 */
export interface Hypothesis {
  id: string;
  type: "anomaly" | "correlation" | "incident" | "trend";
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  location: { lat: number; lon: number } | null;
  relatedEntityIds: EntityId[];
  evidenceIds: string[];
  createdAt: string;
  status: EventStatus;
  runId: RunId;
}

/**
 * Evidence - supporting facts for hypotheses
 *
 * Structured facts that support or refute a hypothesis.
 * Allows correlation agents to build confidence.
 */
export interface Evidence {
  id: string;
  type: string;
  content: string;
  source: string;
  timestamp: string;
  entityIds: EntityId[];
  location: { lat: number; lon: number } | null;
  confidence: number;
  metadata: Record<string, unknown>;
}

/**
 * AgentInsight - final insight for UI display
 *
 * The end product of the agent pipeline.
 * Contains all information needed for UI presentation.
 */
export interface AgentInsight {
  id: string;
  type: "anomaly" | "correlation" | "prediction" | "absence" | "trend_shift";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  location: { lat: number; lon: number } | null;
  entities: EntityId[];
  confidence: number;
  timestamp: string;
  published: boolean;
  eventStatus: EventStatus;
  runId: RunId;
  hypothesisId: string | null;
}

/** Simplified input for creating tasks */
export interface AgentTaskInput {
  taskType: TaskType;
  priority?: Priority;
  source: string;
  targetEntityIds: EntityId[];
  payload: Record<string, unknown>;
  parentTaskId?: TaskId | null;
}

/** Structured hypothesis type from detector */
export type HypothesisType =
  | "traffic_spike"
  | "holding_pattern"
  | "absence_signal"
  | "route_deviation"
  | "velocity_anomaly"
  | "spatial_cluster"
  | "geofence_breach";

/** Typed hypothesis from detectors - more structured than generic anomaly */
export interface TypedHypothesis {
  id: string;
  hypothesisType: HypothesisType;
  type: "anomaly" | "correlation" | "incident" | "trend";
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  score: number;
  location: { lat: number; lon: number } | null;
  entityIds: EntityId[];
  evidenceRefs: string[];
  relatedEventIds: string[];
  sourceRefs: string[];
  createdAt: string;
  status: EventStatus;
  runId: RunId;
  regionKey: string | null;
}

/** Enhanced insight with freshness and lifecycle */
export interface AgentInsight {
  id: string;
  type: "anomaly" | "correlation" | "prediction" | "absence" | "trend_shift";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  location: { lat: number; lon: number } | null;
  entities: EntityId[];
  confidence: number;
  timestamp: string;
  published: boolean;
  eventStatus: EventStatus;
  runId: RunId;
  hypothesisId: string | null;
  freshnessMs: number;
  expiresAt: string | null;
}

/** UI event type for frontend */
export type UIEventType = "map_popup" | "event_log" | "inspector_update" | "alert_badge";

/** Operator action types for insights */
export type OperatorActionType =
  | "acknowledge" // Mark as seen
  | "dismiss" // Remove from view
  | "resolve" // Mark as resolved
  | "snooze" // Suppress similar for period
  | "inspect" // Open details
  | "track" // Track entity
  | "open_timeline"; // Open timeline view

/** Action available to user on insight */
export interface UIInsightAction {
  id: string;
  label: string;
  actionType: OperatorActionType;
}

/** UI-ready insight event payload */
export interface UIInsightEvent {
  id: string;
  type: UIEventType;
  insightId: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  message: string;
  location: { lat: number; lng: number } | null;
  entityIds: string[];
  confidence: number;
  timestamp: string;
  ttlMs: number | null;
  actions: UIInsightAction[];
}
