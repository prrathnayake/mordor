# Project Starter Pack: Live Real-World Simulation / Digital Twin Platform

## Purpose
This document pack is the operating contract for building a browser-based real-world simulation platform that can ingest live data, maintain a time-aware world model, replay past activity, and support AI-assisted monitoring.

This pack is designed for **vibe-coded development with strict controls**.  
That means:
- fast implementation is allowed
- improvisation is allowed inside bounded areas
- architecture drift is **not** allowed
- every major feature must prove compliance through tests and review gates

## What this pack contains
1. `01_PRODUCT_VISION.md`  
   Product goals, non-goals, users, scope, and MVP definition.

2. `02_SYSTEM_ARCHITECTURE.md`  
   High-level system architecture, bounded contexts, runtime components, and data flow.

3. `03_DOMAIN_MODEL.md`  
   Canonical event model, object model, timeline semantics, and storage rules.

4. `04_FRONTEND_DESIGN.md`  
   UI architecture, screen layout, interaction design, and rendering concerns.

5. `05_BACKEND_DESIGN.md`  
   API boundaries, services, workers, realtime streaming, and processing rules.

6. `06_DATA_INGESTION_AND_NORMALIZATION.md`  
   Source adapters, normalization contracts, retries, and failure handling.

7. `07_REPLAY_TIMELINE_AND_ANALYTICS.md`  
   Time controls, playback model, AI analytics boundaries, and alerting logic.

8. `08_SECURITY_PRIVACY_AND_SAFETY.md`  
   Security model, privacy boundaries, source governance, and audit expectations.

9. `09_REPOSITORY_STRUCTURE.md`  
   Recommended repo layout and code ownership boundaries.

10. `10_IMPLEMENTATION_PLAN.md`  
    Phase-by-phase implementation plan with milestones and exit criteria.

11. `11_TEST_STRATEGY.md`  
    Test architecture, test pyramid, and mandatory coverage for a strict build.

12. `12_HARD_GATES_AND_COMPLIANCE.md`  
    Hard checks that block merges when the implementation drifts from plan.

13. `13_ADR_TEMPLATE.md`  
    Architecture Decision Record template for controlled deviations.

14. `14_AGENT_VIBE_CODING_RULES.md`  
    Rules for human and AI-assisted development to keep the project aligned.

15. `15_ACCEPTANCE_CHECKLIST.md`  
    Release readiness checklist.

16. `16_BOOTSTRAP_TASKS.md`  
    What to create first in week 1.

17. `17_RISK_REGISTER.md`  
    Major project risks and mitigations.

18. `runbooks/SWAN_PROTOCOL.md`
    Swan protocol lifecycle, runtime artifacts, and operator runbook guidance.

## Core build philosophy
Build this as a **time-aware geospatial event platform**, not as a giant "AI everything" system.

The first version should do exactly this:
- show a 3D world or map scene
- ingest a small number of live feeds
- normalize all events into a canonical model
- store them durably
- stream them to clients
- replay them across time
- trigger simple analytics and alerts
- prove correctness through hard tests

## Scope discipline
The project must begin with one narrow operating domain:
- campus monitoring
- warehouse yard monitoring
- port / vessel awareness
- smart city traffic corridor
- factory or industrial zone
- airspace and satellite awareness

Do not start with “the whole world”.

## Design principle
Every new feature must answer:
1. What canonical entities does it add?
2. What new contracts does it require?
3. How is it tested?
4. How is it replayed?
5. How is it audited?
6. Can it fail without corrupting the timeline?

## Definition of success
A successful MVP can:
- display a world scene
- render live moving objects
- save every object update as time-stamped events
- replay a chosen time range
- explain why an alert fired
- survive ingest errors without losing integrity
- pass hard compliance gates

## Recommended reading order
Read in this order:
1. product vision
2. system architecture
3. domain model
4. implementation plan
5. test strategy
6. hard gates
7. repo structure
8. bootstrap tasks
