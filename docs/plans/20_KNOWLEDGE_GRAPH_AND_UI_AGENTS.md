# Phase 20: Knowledge Graph and UI Agent System - PLAN

## Status: APPROVED

## Vision Summary

Mordor is a world monitoring and real-time information processing tool. It collects data from diverse sources, stores them with metadata, and uses **two types of AI agents**:

1. **Server-side Knowledge Agents** — Build a knowledge graph from collected data, analyze relationships across sources, connect dots to uncover underlying truth
2. **Browser-based UI Agents** — Observe user interactions on the dashboard, dynamically render data on the globe using pre-defined UI components

The UI has a **fixed template** (rails, panels, headers) for static layout. AI agents work *on top* of it — when a user interacts (e.g., searches news, clicks a link), UI agents trigger, collect necessary data from the backend, and render dynamic components on the globe. All dynamic states are stored in the database for future replay and monitoring.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Frontend)                        │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Fixed UI Template (HTML/CSS)                 │   │
│  │  ┌────────┐ ┌──────────────────────┐ ┌───────────────┐  │   │
│  │  │  Left   │ │                      │ │   Right       │  │   │
│  │  │  Rail   │ │   Cesium Globe       │ │   Panel       │  │   │
│  │  │ (Layers)│ │   (Dynamic Area)     │ │ (Details)     │  │   │
│  │  └────────┘ │                      │ └───────────────┘  │   │
│  │             └──────────────────────┘                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌── UIAgentRuntime (main thread) ──────────────────────────┐   │
│  │  NewsExplorer Agent  │  EntityLinker Agent                │   │
│  │  EventSequencer Agent│  ContextProber Agent               │   │
│  │      ┌───────────────┴───────────────┐                   │   │
│  │      │ WidgetManager (existing)      │                   │   │
│  │      │ RouteLine │ Cluster │ InfoCard│                   │   │
│  │      │ AlertBadge │ Tooltip          │                   │   │
│  │      └───────────────────────────────┘                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                    │ SSE + REST                                  │
└────────────────────┼────────────────────────────────────────────┘
                     │
┌────────────────────┼────────────────────────────────────────────┐
│                    │          API Server (apps/api)              │
│  ┌────────────────┴──────────────────────────┐                  │
│  │            /graph/* REST routes            │                  │
│  │  /graph/entities   /graph/relationships   │                  │
│  │  /graph/query      /graph/chains          │                  │
│  └────────────────┬─────────────────────────┘                  │
│                   │                                             │
│  ┌────────────────┴──────────────────────────┐                  │
│  │      packages/graph (Neo4j Driver)         │                  │
│  │  Entity CRUD │ Relationship CRUD │         │                  │
│  │  Traversal │ Causal Chain Builder          │                  │
│  └────────────────┬─────────────────────────┘                  │
│                   │                                             │
│  ┌────────────────┴──────────────────────────┐                  │
│  │         packages/llm (OpenRouter)          │                  │
│  │  OpenAI-compatible HTTP client             │                  │
│  └────────────────┬─────────────────────────┘                  │
│                   │                                             │
│  ┌────────────────┴──────────────────────────┐                  │
│  │        Agent Swarm (apps/agents)           │                  │
│  │                                           │                  │
│  │  ┌──────────┐  ┌──────────┐  ┌────────┐  │                  │
│  │  │Collector │─▶│ Detector │─▶│Publisher│  │ (existing)      │
│  │  └──────────┘  └──────────┘  └────────┘  │                  │
│  │                                           │                  │
│  │  ┌──────────┐  ┌──────────────┐          │                  │
│  │  │Entity    │─▶│ Relationship │          │ (new)            │
│  │  │Extractor │  │ Miner        │          │                  │
│  │  └──────────┘  └──────────────┘          │                  │
│  └───────────────────────────────────────────┘                  │
│                   │                                             │
│  ┌────────────────┴──────────────────────────┐                  │
│  │     PostgreSQL + PostGIS (existing)        │                  │
│  │  Canonical events, states, alerts, etc.   │                  │
│  └───────────────────────────────────────────┘                  │
│                                                                   │
│  ┌──────────────────────────────────────────┐                   │
│  │     Neo4j Graph Database (new)            │                   │
│  │  Entities │ Relationships │ Event Chains  │                   │
│  └──────────────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Choices

| Decision | Choice | Rationale |
|---|---|---|
| **LLM Provider** | OpenRouter | OpenAI-compatible API, access to many models (Claude, GPT-4o, etc.) through one endpoint, bring-your-own-key |
| **Graph Database** | Neo4j | Native graph model, Cypher for traversal, excellent for entity-relationship queries at scale |
| **UI Agent Runtime** | Inline (main thread) | Direct access to existing Cesium globe + WidgetManager, no postMessage overhead |
| **Implementation Approach** | Parallel sub-agents | Work streams divided into independent tracks, reviewed together at end |

---

## Implementation Plan — 6 Parallel Work Streams

### Stream 1: Neo4j Infrastructure + Graph Package
**Package: `packages/graph`**

- Add Neo4j Docker service to `infra/compose/docker-compose.yml` (port 7687, auth: neo4j/password)
- Add `neo4j-driver` npm dependency
- Create `packages/graph/` with:
  - `Neo4jDriver` — connection pool, health check, session management
  - `EntityRepository` — CRUD for graph entities (typed nodes with properties)
  - `RelationshipRepository` — CRUD for typed, directed relationships with weight + confidence
  - `GraphTraversal` — Cypher queries for: nearest entities, shortest path, subgraph extraction, time-window filtering
- Entity types: Source, Object, Event, Location, Person, Organization, Article, Alert, Incident, Layer
- Relationship types: ASSOCIATED_WITH, LOCATED_AT, OCCURRED_DURING, MENTIONS, CAUSES, CORRELATES_WITH, SOURCE_OF, LINKS_TO
- Add REST routes to `apps/api/src/server.ts`

### Stream 2: OpenRouter LLM Integration
**Package: `packages/llm`**

- LLMService — OpenAI-compatible HTTP client for OpenRouter API
- Model routing: Claude 3.5 Sonnet for reasoning, GPT-4o-mini for extraction
- Retry with exponential backoff, token tracking
- PromptTemplates for entity extraction, relationship mining, narrative building

### Stream 3: Server-side Knowledge Agents
**Extend: `apps/agents`**

- EntityExtractorAgent — reads source data, calls LLM, extracts entities, writes to Neo4j
- RelationshipMinerAgent — reads entities, calls LLM, discovers cross-source relationships
- New docker-compose services

### Stream 4: Browser-based UI Agent System
**New: `packages/ui-agents`**

- UIAgentRuntime — observe → evaluate → dispatch loop
- EventTracer — wraps DOM events with interaction context
- 4 agents: NewsExplorer, EntityLinker, EventSequencer, ContextProber
- Each calls Graph API + WidgetManager to render on globe

### Stream 5: Dynamic Event Sequences
**Extend: `packages/graph`**

- EventChainBuilder — traverses causal relationships into ordered chains
- CausalLinkRepository — pathfinding between entities
- REST: POST /graph/chains/from/:entityId, GET /graph/chains/:chainId

### Stream 6: Integration, Fixtures, and E2E Tests
**Files: `tests/`**

- Neo4j testcontainer
- Golden fixtures for entities + relationships + chains
- Playwright E2E: news click → globe widgets
- npm run validate passes

---

## Execution Order

```
Parallel Week 1:  Stream 1 ────┐  Stream 2 ────┐  Stream 4 ────┐
                               │                │               │
Parallel Week 2:  Stream 3 ◄───┴──┐  Stream 5 ◄─┘               │
                                 │                              │
Week 3:  Stream 6 ◄──────────────┴──────────────────────────────┘
         Full review + test
```
