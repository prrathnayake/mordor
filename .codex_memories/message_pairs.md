# Message Pairs

Record each completed task as:
- Timestamp
- Full exact user message
- Concise summary of the assistant's final response

## 2026-04-12 10:44:31 +10:00
### User Message
I want you to initialize this repository for long-running Codex work.

Project context:
- Project name: [PROJECT_NAME]
- Primary branch: [main]
- External docs hub: [DOCS_URL or "none"]
- Main test command: [TEST_COMMAND]
- Quick smoke checks: [SMOKE_CHECKS or "none"]
- Preferred test root: [tests/]
- Manual/ad hoc output folder: [tests/manual/outputs/ or equivalent]

Set up and maintain these repo-local artifacts:
- `AGENTS.md`
- `imp_instructions.md`
- `.codex_memories/system_prompt.md`
- `.codex_memories/daily_summary.md`
- `.codex_memories/message_pairs.md`
- `.codex_memories/YYYY-MM-DD/revival_summary.md`
- `.codex_memories/YYYY-MM-DD/task_log.md`

Requirements:
- Inspect the repo first, then create or update the files above so they match this project instead of using generic wording.
- Put the durable, full project workflow in `AGENTS.md`.
- Put the short operational checklist in `imp_instructions.md`.
- Put the compact memory protocol snapshot in `.codex_memories/system_prompt.md`.

Rules that must be encoded:
- Persist reusable context only in `.codex_memories/`.
- Always read `imp_instructions.md`, `.codex_memories/system_prompt.md`, `.codex_memories/daily_summary.md`, and today's memory files before starting a task.
- On the first task of a day, review the previous day folder and write or refresh today's `revival_summary.md`.
- At the end of every task, append a timestamped entry to today's `task_log.md`.
- At the end of every task, refresh today's summary/revival notes, update `.codex_memories/daily_summary.md`, and append the full exact user message plus a concise summary of the assistant's final response to `.codex_memories/message_pairs.md`.
- Use one folder per day under `.codex_memories/YYYY-MM-DD/`.
- Keep separate memory files by concern; do not collapse everything into one catch-all log.
- Work only on `[PRIMARY_BRANCH]` unless explicitly asked otherwise.
- Before any commit, review `.env` and `.gitignore` and never commit secrets.
- Keep commits focused and use imperative subjects like `Add ...`, `Update ...`, or `Fix ...`.
- Preserve and update useful docstrings/comments when touching orchestration-heavy or non-trivial code.
- Never revert unrelated user changes.
- Keep automated tests under the project's test tree and keep manual/debug outputs isolated.
- When a task materially changes architecture, prompts, memory flow, tools, gateways, workflows, or user-facing apps, update the external docs hub `[DOCS_URL]` if one exists; if it is unavailable, record the follow-up in local memory before ending the task.

What `AGENTS.md` should cover:
- Project structure and important directories
- Build/setup commands
- Test commands and testing conventions
- Coding style and naming conventions
- Comment/docstring expectations
- Commit and PR rules
- Security/configuration rules
- Memory/task protocol
- Documentation sync expectations

Execution instructions:
- Reuse existing docs if a clear home already exists.
- If the repo already has partial memory or agent instructions, normalize and extend them instead of replacing them blindly.
- Make reasonable assumptions from local repo context when safe.
- Only ask questions if a wrong assumption would be risky.
- After setup, summarize exactly what you created and the workflow future Codex runs must follow.
### Assistant Final Response Summary
Inspected the monorepo, converted `AGENTS.md` into a Chrona Twin-specific long-running workflow guide, added `imp_instructions.md`, created the `.codex_memories/` protocol files and today's daily folder, noted that no external docs hub is configured, recorded the `main` versus `master` branch mismatch for future runs, and isolated manual/debug artifacts under `tests/manual/outputs/`.

## 2026-04-12 10:48:30 +10:00
### User Message
commit your changes\
### Assistant Final Response Summary
Reviewed `.env` and `.gitignore`, re-read the required memory files, staged only the repo-local Codex workflow artifacts, and committed them as a focused local setup commit on the current `master` branch because no local `main` branch exists yet.
