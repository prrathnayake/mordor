# Daily Summary

## Current Repo Snapshot
- Project name: Chrona Twin
- Repository type: TypeScript monorepo for a geospatial digital twin platform
- Intended primary branch: `main`
- Current observed local branch during setup: `master`
- Main verification command: `npm run validate`
- Quick smoke checks: `npm run typecheck`, `npm run lint`, and the smallest affected Vitest/Playwright slice
- Preferred test root: `tests/`
- Manual/ad hoc output folder: `tests/manual/outputs/`
- External docs hub: none configured

## Working Norms
- Reusable memory lives only in `.codex_memories/`.
- Local docs in `docs/` should be kept in sync for material architecture, workflow, tooling, gateway, prompt, or user-facing app changes.
- Before commits, review `.env` and `.gitignore` for secrets and local output leaks.
- Preserve useful comments/docstrings in orchestration-heavy or non-trivial code.

## Open Notes
- The repo already contains unrelated in-progress changes; future Codex work should avoid reverting them.
- A branch-name mismatch exists between the requested primary branch (`main`) and the current checkout (`master`). Future runs should verify branch intent before branch-sensitive work.
- The current worktree includes intentional uncommitted runtime, UI, test-harness, and test updates; inspect `git status --short` before any branch or commit action.

## Last Completed Task
- 2026-04-12 10:44:31 +10:00: Initialized repo-local Codex workflow artifacts, created today's memory folder, and established `tests/manual/outputs/` as the isolated manual output path.
- 2026-04-12 10:48:30 +10:00: Prepared a focused commit for the instruction and memory scaffolding while leaving the repo's unrelated SWAN/docs changes untouched.
- 2026-04-13 09:56:17 +10:00: Collected current project/architecture context from code, refreshed the primary runtime docs, fixed API/web startup port mismatches, corrected nearest-source distance calculations to meters in both persistence and SWAN queries, added `400 invalid_json` handling for malformed API request bodies, and verified the changes with lint, typecheck, and focused unit suites.
- 2026-04-13 11:46:05 +10:00: Ran a broad bug-fix and verification loop across API, SWAN, external-data adapters, UI behavior, and test harnesses; fixed replay/alert/CCTV UI regressions, stabilized shared Postgres test environments, removed a retry-vs-rate-limit bug from the external-data HTTP client, hardened API shutdown to drain in-flight requests before closing the pool, refreshed failing Playwright/Vitest specs, and completed a full green `npm run validate` pass (`33` Vitest files / `269` tests, `127` Playwright tests).
