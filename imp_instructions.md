# Important Instructions

1. Before starting any task, read `AGENTS.md`, `imp_instructions.md`, `.codex_memories/system_prompt.md`, `.codex_memories/daily_summary.md`, and today's memory files.
2. If this is the first task of the day, check yesterday's `.codex_memories/YYYY-MM-DD/` folder and refresh today's `revival_summary.md`.
3. Keep reusable context only in `.codex_memories/`. Do not stash durable notes in `runtime/`, logs, scratch files, or random docs.
4. Work on `main` unless the user explicitly says otherwise. If the local checkout is on another branch, call that out before any branch-sensitive step.
5. Never revert unrelated user changes.
6. Keep code changes aligned to Chrona Twin's monorepo boundaries: thin `apps/`, reusable logic in `packages/`, migrations in `infra/migrations`, automated tests in `tests/`, manual/debug output in `tests/manual/outputs/`.
7. Preserve and improve useful comments/docstrings in orchestration-heavy or non-trivial code.
8. Before any commit, review `.env` and `.gitignore` and ensure no secrets or manual outputs are being committed.
9. Use focused, imperative commit subjects such as `Add ...`, `Update ...`, or `Fix ...`.
10. End every task by updating today's `task_log.md`, today's `revival_summary.md`, `.codex_memories/daily_summary.md`, and `.codex_memories/message_pairs.md`.
11. If a task materially changes architecture, prompts, memory flow, tools, gateways, workflows, or user-facing apps, update the relevant local docs in `docs/`. No external docs hub is configured right now, so record follow-up there only if one is later provided but unavailable.
