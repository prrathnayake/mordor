# Repository Guidelines

## Project Identity
Chrona Twin is a TypeScript monorepo for a browser-based geospatial digital twin platform with live monitoring, replay, alerting, evidence capture, and SWAN/inference-oriented intelligence flows. Treat this repo as the authoritative local workspace for long-running Codex work.

## Project Structure & Important Directories
- Runtime entrypoints live in `apps/`:
  - `apps/api` for the HTTP and SSE backend
  - `apps/web` for the browser client and tactical UI shell
  - `apps/worker` for fixture and ingestion jobs
- Shared logic belongs in `packages/`. Important bounded contexts currently include `adapters`, `alerts`, `analytics`, `auth`, `config`, `contracts`, `domain`, `external-data`, `ingestion`, `logging`, `persistence`, `replay`, `swan`, `test-fixtures`, and `ui-components`.
- SQL and infra assets live in `infra/`, especially `infra/migrations` for ordered Postgres/PostGIS migrations.
- Automation and repo gates live in `scripts/`.
- Project docs and runbooks live in `docs/`, with plans in `docs/plans/`, ADRs in `docs/adr/`, and ops material in `docs/OPS_*.md`.
- Tests live under `tests/` by boundary: `unit`, `contract`, `integration`, `replay`, `e2e`, plus helper/support areas such as `helpers`, `performance`, and `security`.
- Golden fixtures live in `packages/test-fixtures/fixtures`.
- Manual or ad hoc artifacts must stay isolated under `tests/manual/outputs/` and not be mixed into automated suites.
- Runtime scratch/log output may appear in `runtime/` or `*.log`, but reusable context must never be stored there.

## Build, Setup, and Run Commands
Use Node `24.x` and npm `11+` to match the package engines and CI expectations.

- `npm ci` installs the locked dependency graph.
- `npm run api:dev` starts `apps/api/src/server.ts` with `.env`.
- `npm run web:dev` serves the browser app from `apps/web/src/server.ts`.
- `npm run worker:fixture` runs the worker entrypoint from `apps/worker/src/index.ts`.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run lint` runs Biome checks.
- `npm run gate` runs repo-specific doc, architecture, contract, and adapter validation scripts.
- `npm run test` runs Vitest and Playwright.
- `npm run validate` is the canonical full verification command for pre-PR or pre-merge work.

## Testing Commands & Conventions
- Preferred test root: `tests/`.
- Main verification command: `npm run validate`.
- Focused automated suites:
  - `npm run test:unit`
  - `npm run test:contract`
  - `npm run test:integration`
  - `npm run test:replay`
  - `npm run test:e2e`
- Fast smoke checks for small changes:
  - `npm run typecheck`
  - `npm run lint`
  - the smallest relevant Vitest slice for the affected boundary
- Name tests `*.spec.ts` and keep them in the matching `tests/` layer.
- If contracts, persistence, replay ordering, adapters, or migrations change, update fixtures and schemas together and run the smallest relevant suite before expanding to `npm run validate`.
- Keep automated tests in `tests/`; keep manual experiments, screenshots, dumps, and debug output in `tests/manual/outputs/`.

## Coding Style & Naming Conventions
- Follow `.editorconfig` and `biome.json`: 2-space indentation, LF endings, double quotes, semicolons, and a 100-column target.
- Keep `apps/` thin and move reusable or cross-boundary logic into the relevant `packages/` module.
- Use `camelCase` for functions and variables, `PascalCase` for types/interfaces/classes, and `kebab-case` for filenames.
- Preserve existing `snake_case` when it mirrors database columns, persisted payloads, or public API contracts.
- In TypeScript ESM files, keep local import specifiers ending in `.js`.

## Comments & Docstrings
- Preserve useful comments/docstrings when touching orchestration-heavy, gateway-heavy, schema-heavy, or otherwise non-trivial code.
- Add or refresh concise comments where they help future readers understand sequencing, invariants, protocol expectations, or failure handling.
- Do not add noisy comments for obvious code.

## Commit & PR Rules
- Work only on `main` unless the user explicitly asks otherwise.
- The current local checkout may not already be on `main`; verify branch state before branch-sensitive work instead of assuming.
- Never revert unrelated user changes.
- Before any commit, review `.env` and `.gitignore` and do not commit secrets or local-only outputs.
- Keep commits focused and imperative. Prefer short subjects such as `Add swan startup validation`, `Update replay docs`, or `Fix source registry contract`.
- Conventional Commit prefixes are acceptable when they stay imperative and scoped, for example `fix: stabilize replay rendering`.
- PRs should describe the bounded context changed, note contract/replay/migration impact, list tests run, and mention any docs updates. Include screenshots for `apps/web` UI changes.

## Security & Configuration Rules
- Copy `.env.example` for local setup; never commit real secrets.
- Keep connection details and tokens in environment variables, not source, fixtures, or docs examples.
- Database-backed work assumes PostgreSQL/PostGIS; treat migrations and schema docs as coupled changes.
- Review `.env` and `.gitignore` before commits to avoid leaking credentials or accidental local artifacts.

## Memory & Task Protocol
- Persist reusable context only in `.codex_memories/`.
- Always read these files before starting any task:
  - `imp_instructions.md`
  - `.codex_memories/system_prompt.md`
  - `.codex_memories/daily_summary.md`
  - today's `.codex_memories/YYYY-MM-DD/revival_summary.md`
  - today's `.codex_memories/YYYY-MM-DD/task_log.md`
- Use one folder per day under `.codex_memories/YYYY-MM-DD/`.
- On the first task of a day, review the previous day folder if it exists and write or refresh today's `revival_summary.md` before doing substantive work.
- Keep memory files separated by concern:
  - `system_prompt.md` for the compact operating protocol
  - `daily_summary.md` for the current rolling state
  - `message_pairs.md` for exact user messages plus concise final-response summaries
  - daily `revival_summary.md` for session restart context
  - daily `task_log.md` for timestamped task history
- At the end of every task:
  - append a timestamped entry to today's `task_log.md`
  - refresh today's `revival_summary.md`
  - update `.codex_memories/daily_summary.md`
  - append the full exact user message plus a concise summary of the assistant's final response to `.codex_memories/message_pairs.md`
- Do not collapse all memory into one catch-all file.

## Documentation Sync Expectations
- No external docs hub URL is currently configured for this repo. Treat that as `none` until the user provides one.
- The local `docs/` tree is still part of the required workflow and should stay aligned with meaningful code changes.
- When a task materially changes architecture, prompts, memory flow, tools, gateways, workflows, or user-facing apps, update the relevant local docs in `docs/`.
- If an external docs hub is introduced later and is unavailable during a docs-worthy task, record the follow-up explicitly in `.codex_memories/` before ending the task.
