# Agent Protocol Architecture

## Overview

The Agent Protocol implements a swarm-based intelligence system where specialized agents work collaboratively to collect data, detect anomalies, and generate insights for the UI. Agents run as separate worker processes and communicate via Redis pub/sub and a shared PostgreSQL task queue.

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                      API Server                              │
│  - Serves UI requests                                       │
│  - Pushes SSE/WebSocket events                              │
│  - Queries insights from DB                                 │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ SSE/WebSocket
                              │
┌─────────────────────────────────────────────────────────────┐
│                    Redis Event Bus                           │
│  - agent:events channel                                     │
│  - Real-time event distribution                             │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ Pub/Sub
                              │
┌──────────────┬──────────────┼──────────────┬───────────────┐
│   Collector  │   Detector   │  Correlator  │   Publisher   │
│    Agent     │    Agent     │    Agent     │    Agent      │
└──────────────┴──────────────┼──────────────┴───────────────┘
                               │
┌──────────────────────────────┴────────────────────────────┐
│                   AgentCoordinator                         │
│  - Task routing                                             │
│  - Lock management                                          │
│  - Deduplication                                           │
└─────────────────────────────────────────────────────────────┘
                               │
┌──────────────────────────────┴────────────────────────────┐
│                    PostgreSQL                              │
│  - agent_configs      - Agent registry                      │
│  - agent_tasks        - Task queue                          │
│  - agent_locks       - Resource locks                      │
│  - agent_observations - Raw observations                   │
│  - agent_hypotheses  - Detected patterns                   │
│  - agent_evidence   - Supporting evidence                  │
│  - agent_insights   - UI-ready insights                    │
│  - agent_events     - Event ledger                         │
└─────────────────────────────────────────────────────────────┘
```

## Core Concepts

### Task Envelope

Every unit of work is represented as a `TaskEnvelope`:

```typescript
interface TaskEnvelope {
  taskId: string;
  runId: string;
  parentTaskId: string | null;
  taskType: "collect" | "detect_anomaly" | "detect_correlation" | "enrich" | "publish";
  priority: "low" | "medium" | "high" | "critical";
  source: string;
  targetEntityIds: string[];
  assignedAgent: string | null;
  status: "queued" | "claimed" | "running" | "completed" | "failed" | "discarded";
  payload: Record<string, unknown>;
  constraints: {
    deadlineMs: number;
    maxRetries: number;
    lockTtlMs?: number;
  };
  createdAt: string;
}
```

### Agent Roles

| Agent Type | Task Types | Description |
|------------|------------|-------------|
| `collector` | `collect` | Gathers raw data from sources |
| `detector` | `detect_anomaly` | Finds anomalies using statistical methods |
| `correlator` | `detect_correlation` | Links related entities/events |
| `enrichment` | `enrich` | Adds context from external sources |
| `publisher` | `publish` | Creates UI-visible alerts |

### Structured Handoff Protocol

Agents must follow strict handoff rules:

1. **Collector** emits normalized `Observation`
2. **Detector** consumes observations, emits candidate `Hypothesis`
3. **Correlator** consumes hypotheses, emits correlated incidents
4. **Publisher** consumes approved events, creates user-visible alerts

```
collect → detect_anomaly → detect_correlation → enrich → publish
```

### Lock & Claim System

To prevent duplicate work:

- Agents claim tasks via `claimTask(agentId, taskTypes[])`
- Database-level `FOR UPDATE SKIP LOCKED` ensures atomicity
- Locks expire after `lockTtlMs` (default 30s)
- Deduplication via `dedupe_key` prevents re-processing same entities

### Event Status Flow

Insights progress through fixed states:

```
candidate → validated → correlated → approved → published → resolved
```

## Running Agents

### Local Development

```bash
# Start collector
DATABASE_URL=postgres://... REDIS_URL=redis://... npm run agent:collector

# Start detector
DATABASE_URL=postgres://... REDIS_URL=redis://... npm run agent:detector
```

### Docker

```bash
docker compose up -d agent-collector agent-detector
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection URL |
| `AGENT_MODE` | Yes | `collector` or `detector` |
| `AGENT_ID` | No | Unique agent identifier |

## Creating Tasks

Tasks are created by any service that needs agent work:

```typescript
const coordinator = new AgentCoordinator({ db, logger });

const taskId = await coordinator.createTask({
  taskType: "detect_anomaly",
  priority: "high",
  source: "live_flights",
  targetEntityIds: ["flight_123", "flight_456"],
  payload: { timeRange: "last_10m" },
  dedupeKey: "flight_anomaly_123"  // Prevents duplicate processing
});
```

## Subscribing to Events

```typescript
const eventBus = new AgentEventBus({ redisUrl, logger });

await eventBus.connect();

await eventBus.subscribe("anomaly.detected", async (event) => {
  console.log("New anomaly:", event.payload);
  // Push to UI via SSE
});
```

## Database Schema

See `infra/migrations/0009_agent_protocol.sql` for complete schema.

### Key Tables

- **agent_configs**: Agent registry with heartbeat tracking
- **agent_tasks**: Priority queue with deduplication support
- **agent_locks**: Distributed locks for resource ownership
- **agent_observations**: Raw data from collectors
- **agent_hypotheses**: Detected patterns from analyzers
- **agent_insights**: Final UI-ready insights
- **agent_events**: Append-only audit log

## Design Principles

1. **Protocol over prompts** - Task contracts enforce behavior, not prompts
2. **Separation of concerns** - Each agent type has a single responsibility
3. **Event-sourced** - All state changes logged for debugging
4. **Lock-based coordination** - Prevents conflicts without centralized arbitration
5. **Graceful degradation** - Failed tasks retry with backoff
