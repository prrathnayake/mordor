-- Migration: Agent Protocol
-- Adds agent task management, insights, and coordination tables

BEGIN;

-- Agent configurations and registry
CREATE TABLE agent_configs (
  agent_id TEXT PRIMARY KEY,
  agent_type TEXT NOT NULL CHECK (agent_type IN ('collector', 'detector', 'correlator', 'enrichment', 'coordinator', 'publisher')),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'disabled')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat_at TIMESTAMPTZ NULL,
  CHECK (jsonb_typeof(config) = 'object')
);

CREATE INDEX agent_configs_type_idx ON agent_configs (agent_type);
CREATE INDEX agent_configs_status_idx ON agent_configs (status);

-- Task queue for agent work
CREATE TABLE agent_tasks (
  task_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  parent_task_id TEXT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('collect', 'detect_anomaly', 'detect_correlation', 'enrich', 'publish', 'escalate')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  source TEXT NOT NULL,
  target_entity_ids TEXT[] NOT NULL DEFAULT '{}',
  assigned_agent TEXT NULL REFERENCES agent_configs(agent_id),
  status TEXT NOT NULL CHECK (status IN ('queued', 'claimed', 'running', 'blocked', 'completed', 'failed', 'discarded', 'escalated')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  constraints JSONB NOT NULL DEFAULT '{"deadlineMs": 30000, "maxRetries": 2}'::jsonb,
  dedupe_key TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  error TEXT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (jsonb_typeof(constraints) = 'object')
);

CREATE INDEX agent_tasks_status_idx ON agent_tasks (status);
CREATE INDEX agent_tasks_type_idx ON agent_tasks (task_type);
CREATE INDEX agent_tasks_priority_idx ON agent_tasks (priority DESC, created_at ASC);
CREATE INDEX agent_tasks_dedupe_idx ON agent_tasks (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX agent_tasks_run_idx ON agent_tasks (run_id);
CREATE INDEX agent_tasks_assigned_idx ON agent_tasks (assigned_agent) WHERE assigned_agent IS NOT NULL;

-- Agent locks for claim/lease system
CREATE TABLE agent_locks (
  lock_id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  agent_id TEXT NOT NULL REFERENCES agent_configs(agent_id),
  task_id TEXT NULL REFERENCES agent_tasks(task_id),
  status TEXT NOT NULL CHECK (status IN ('active', 'released', 'expired')),
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  heartbeat_at TIMESTAMPTZ NULL,
  UNIQUE (resource_type, resource_id, status)
);

CREATE INDEX agent_locks_resource_idx ON agent_locks (resource_type, resource_id);
CREATE INDEX agent_locks_agent_idx ON agent_locks (agent_id);
CREATE INDEX agent_locks_expires_idx ON agent_locks (expires_at);

-- Observations from collectors
CREATE TABLE agent_observations (
  observation_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('flight', 'satellite', 'earthquake', 'traffic_segment', 'weather_cell', 'incident', 'anomaly', 'signal', 'object', 'alert')),
  entity_id TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  location POINT,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(data) = 'object'),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX agent_observations_entity_idx ON agent_observations (entity_type, entity_id, timestamp DESC);
CREATE INDEX agent_observations_source_idx ON agent_observations (source, timestamp DESC);
CREATE INDEX agent_observations_location_idx ON agent_observations USING GIST (location);

-- Hypotheses from detectors/correlators
CREATE TABLE agent_hypotheses (
  hypothesis_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('anomaly', 'correlation', 'incident', 'trend')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  confidence NUMERIC(5,4) NOT NULL,
  location POINT,
  related_entity_ids TEXT[] NOT NULL DEFAULT '{}',
  evidence_ids TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('candidate', 'validated', 'correlated', 'approved', 'published', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX agent_hypotheses_status_idx ON agent_hypotheses (status);
CREATE INDEX agent_hypotheses_run_idx ON agent_hypotheses (run_id);
CREATE INDEX agent_hypotheses_type_idx ON agent_hypotheses (type);
CREATE INDEX agent_hypotheses_severity_idx ON agent_hypotheses (severity);

-- Evidence supporting hypotheses
CREATE TABLE agent_evidence (
  evidence_id TEXT PRIMARY KEY,
  hypothesis_id TEXT NOT NULL REFERENCES agent_hypotheses(hypothesis_id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  entity_ids TEXT[] NOT NULL DEFAULT '{}',
  location POINT,
  confidence NUMERIC(5,4) NOT NULL DEFAULT 1.0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX agent_evidence_hypothesis_idx ON agent_evidence (hypothesis_id);
CREATE INDEX agent_evidence_type_idx ON agent_evidence (type);

-- Final insights for UI display
CREATE TABLE agent_insights (
  insight_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  hypothesis_id TEXT NULL REFERENCES agent_hypotheses(hypothesis_id),
  type TEXT NOT NULL CHECK (type IN ('anomaly', 'correlation', 'prediction', 'absence', 'trend_shift')),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location POINT,
  entities TEXT[] NOT NULL DEFAULT '{}',
  confidence NUMERIC(5,4) NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  published BOOLEAN NOT NULL DEFAULT false,
  event_status TEXT NOT NULL CHECK (event_status IN ('candidate', 'validated', 'correlated', 'approved', 'published', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ NULL
);

CREATE INDEX agent_insights_severity_idx ON agent_insights (severity);
CREATE INDEX agent_insights_published_idx ON agent_insights (published, timestamp DESC);
CREATE INDEX agent_insights_type_idx ON agent_insights (type);
CREATE INDEX agent_insights_run_idx ON agent_insights (run_id);

-- Event ledger (append-only log of all agent events)
CREATE TABLE agent_events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source_agent TEXT NULL,
  target_agent TEXT NULL,
  task_id TEXT NULL REFERENCES agent_tasks(task_id),
  hypothesis_id TEXT NULL REFERENCES agent_hypotheses(hypothesis_id),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX agent_events_run_idx ON agent_events (run_id);
CREATE INDEX agent_events_type_idx ON agent_events (event_type);
CREATE INDEX agent_events_occurred_idx ON agent_events (occurred_at DESC);

COMMIT;
