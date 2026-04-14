# Revival Summary

## Date
2026-04-14

## Restart Context
- Chrona Twin is a TypeScript monorepo for a browser-based geospatial digital twin platform with live monitoring, replay, alerting, evidence capture, and SWAN-oriented intelligence flows.
- The canonical full verification command remains `npm run validate`.
- The intended primary branch is `main`, but the active local checkout is still `master`; verify branch intent before any branch-sensitive work.
- Durable task memory must stay in `.codex_memories/`, and manual/debug artifacts belong under `tests/manual/outputs/`.
- No external docs hub is configured; local `docs/` remains the authoritative documentation surface.

## First-Task Review
- Reviewed the previous day memory folder at `.codex_memories/2026-04-13/`.
- Carry-forward risks remain the branch-name mismatch and the need to preserve unrelated user changes already present in the worktree when future branch or commit work happens.

## Watch Items
- The top-level structure is cleaner now: Docker and Compose assets live under `infra/`, and current-state docs are grouped under `docs/architecture`, `docs/runbooks`, and `docs/tests`.
- Repo gates still reference a subset of legacy numbered docs, so those root-level docs remain in place even though topical docs are now the preferred navigation path.
- `npm run lint` currently reports pre-existing formatting issues in existing source files outside this structural cleanup; treat that as baseline debt unless a later task intentionally runs a broader formatting sweep.

## Latest Completed Work
- 2026-04-13 09:56:17 +10:00: Refreshed the current-state project and architecture docs, aligned runtime port/default API-base behavior with the config contract, corrected nearest-source distance calculations to meters in persistence and SWAN repository queries, and hardened malformed JSON handling in the API to return a client error instead of a server error.
- 2026-04-13 11:46:05 +10:00: Completed a deeper review/fix cycle across API shutdown, SWAN/UI flows, external-data adapters, and automated tests; stabilized shared Postgres testcontainers usage, fixed external-data retry timing and stale unit expectations, updated multiple Playwright specs to match current UI behavior, and finished with a green full `npm run validate`.
- 2026-04-14 12:12:55 +10:00: Reorganized the repo structure by moving Docker/Compose support out of the root and into `infra/compose` and `infra/docker`, relocated current-state docs into topical `docs/architecture`, `docs/runbooks`, and `docs/tests` folders, refreshed the root and docs indexes to match the new navigation model, and confirmed the required docs gate still passes.
