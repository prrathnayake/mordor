# Agent and Vibe Coding Rules

## Purpose
Allow fast human + AI-assisted implementation without letting the system drift from architecture and contracts.

## Core rule
The AI assistant may generate code quickly, but it is not allowed to invent architecture.

## What the agent is allowed to do
- scaffold files from approved design
- implement bounded functions
- generate tests from explicit contracts
- refactor within a package boundary
- add docs that reflect approved behavior
- propose ADR drafts

## What the agent is not allowed to do without explicit approval
- change canonical event schema
- change replay ordering rules
- move logic across bounded contexts
- add hidden dependencies
- bypass raw payload persistence
- weaken tests to make builds pass
- remove audit or provenance requirements

## Prompting pattern for implementation
Every coding task should specify:
1. target package
2. goal
3. inputs and outputs
4. constraints
5. acceptance tests
6. forbidden shortcuts

## Mandatory AI coding checklist
Before accepting AI-generated code, verify:
- does it fit the package boundary?
- does it change a contract?
- does it alter replay behavior?
- does it add or update tests?
- does it preserve provenance?
- does it preserve auditability?

## Mandatory AI testing checklist
AI-generated tests must be reviewed for:
- false assertions
- happy-path bias
- missing edge cases
- hidden coupling to implementation details
- non-deterministic behavior

## Safe development rules
- one feature branch per bounded change
- one meaningful step at a time
- run tests before expanding scope
- preserve fixtures as truth anchors
- keep ADRs lightweight but current

## Forbidden vibe-coding behaviors
- “just make it work” bypasses
- temporary schema hacks without ADR
- direct DB writes that skip domain validation
- UI-first features without backend contracts
- deleting failing tests instead of fixing logic

## Required review behavior
For each meaningful change:
- inspect diff
- inspect tests
- inspect docs
- inspect package boundary
- inspect replay impact

## Recommended agent task types
Good tasks for AI:
- schema validators
- adapter parser scaffolds
- API route scaffolds
- frontend panel scaffolds
- test fixture generation
- contract tests
- typed client generation

Bad tasks for AI without strong supervision:
- replay semantics redesign
- trust or safety policy decisions
- security model redesign
- storage migration redesign
- analytics rule semantics

## Non-negotiables
1. AI may accelerate implementation.
2. Humans own architecture.
3. Fixtures are truth anchors.
4. Hard gates stay enabled.
