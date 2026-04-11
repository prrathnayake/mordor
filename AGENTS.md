# Repository Guidelines

## Project Structure & Module Organization
This repository is a TypeScript monorepo. Keep runtime entrypoints in `apps/`: `apps/api` for the HTTP/SSE backend, `apps/web` for the browser client, and `apps/worker` for ingestion jobs. Reusable logic belongs in `packages/` (`domain`, `contracts`, `adapters`, `replay`, `persistence`, etc.). Store SQL migrations in `infra/migrations`, automation in `scripts/`, and design or runbook updates in `docs/`. Tests are organized by boundary under `tests/unit`, `tests/contract`, `tests/integration`, `tests/replay`, and `tests/e2e`. Golden fixtures live in `packages/test-fixtures/fixtures`.

## Build, Test, and Development Commands
Use Node `24.x` and npm `11+` to match CI.

- `npm ci` installs locked dependencies.
- `npm run api:dev` starts the API from `apps/api/src/server.ts`.
- `npm run web:dev` serves the web app locally.
- `npm run worker:fixture` runs the worker against fixture input.
- `npm run typecheck` runs `tsc --noEmit`.
- `npm run lint` checks formatting and lint rules with Biome.
- `npm run gate` runs repository-specific doc, architecture, contract, and adapter checks.
- `npm run test` runs Vitest plus Playwright.
- `npm run validate` is the full local pre-PR check.

## Coding Style & Naming Conventions
Follow `.editorconfig` and `biome.json`: 2-space indentation, LF endings, double quotes, semicolons, and a 100-column target. Prefer small modules in `packages/` and keep `apps/` thin. Use `camelCase` for functions, `PascalCase` for types/interfaces, and `kebab-case` for filenames such as `source-registry.spec.ts`. Preserve existing `snake_case` field names where they mirror database columns or API contracts. In TypeScript ESM files, keep local import specifiers ending in `.js`.

## Testing Guidelines
Vitest covers unit, contract, integration, and replay suites; Playwright covers `tests/e2e`. Name tests `*.spec.ts` and place them in the matching layer. New adapters need valid and invalid fixtures plus regression coverage for duplicates or delayed data. If you change contracts, replay ordering, or persistence behavior, update fixtures and run the smallest relevant suite first, then `npm run validate`.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commits (`fix:`, `chore:`); keep subjects short, imperative, and scoped when useful. PRs should state the bounded context changed, note any contract or replay impact, list the tests run, and confirm docs were updated when behavior or architecture changed. Include screenshots for `apps/web` UI changes and link the related issue, plan, or ADR when applicable.

## Security & Configuration Tips
Copy `.env.example` for local setup and never commit real secrets. Database-backed work assumes PostgreSQL/PostGIS; keep connection details in environment variables, not in source or fixtures.
