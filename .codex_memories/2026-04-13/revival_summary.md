# Revival Summary

## Date
2026-04-13

## Restart Context
- Chrona Twin is a TypeScript monorepo for a browser-based geospatial digital twin platform with live monitoring, replay, alerting, evidence capture, and SWAN-oriented intelligence flows.
- The canonical full verification command remains `npm run validate`.
- The intended primary branch is `main`, but the active local checkout is still `master`; verify branch intent before any branch-sensitive work.
- Durable task memory must stay in `.codex_memories/`, and manual/debug artifacts belong under `tests/manual/outputs/`.
- No external docs hub is configured; local `docs/` remains the authoritative documentation surface.

## First-Task Review
- Reviewed the previous day memory folder at `.codex_memories/2026-04-12/`.
- Carry-forward risks remain the branch-name mismatch and the need to preserve unrelated user changes already present in the worktree.

## Watch Items
- The broad docs pack still contains planning-era material; for current implementation details prefer `README.md`, `docs/ARCHITECTURE_OVERVIEW.md`, `docs/INDEX.md`, and `docs/OPS_LOCAL_RUN.md`.
- The active worktree now carries intentional uncommitted runtime/UI/test fixes; review `git status --short` before any commit or branch-sensitive step.
- The SWAN shutdown race that previously logged `Cannot use a pool after calling end on the pool` during e2e teardown was fixed in `apps/api/src/server.ts`; keep that path in mind if future shutdown changes reintroduce teardown noise.

## Latest Completed Work
- 2026-04-12 10:44:31 +10:00: Initialized repo-local Codex workflow artifacts, memory files, and manual-output isolation.
- 2026-04-12 10:48:30 +10:00: Prepared a focused commit containing only the Codex workflow scaffolding after reviewing `.env`, `.gitignore`, and branch state.
- 2026-04-13 09:56:17 +10:00: Refreshed the current-state project and architecture docs, aligned runtime port/default API-base behavior with the config contract, corrected nearest-source distance calculations to meters in persistence and SWAN repository queries, and hardened malformed JSON handling in the API to return a client error instead of a server error.
- 2026-04-13 11:46:05 +10:00: Completed a deeper review/fix cycle across API shutdown, SWAN/UI flows, external-data adapters, and automated tests; stabilized shared Postgres testcontainers usage, fixed external-data retry timing and stale unit expectations, updated multiple Playwright specs to match current UI behavior, and finished with a green full `npm run validate`.
