# Core Agent Memory Engine

This system exists purely for **the coding agent** to persist its intelligence context securely across sessions without destroying its context window limits.

You are treating this repository as a Graph Data-Structure.
AGENTS.md -> .codex_memories/_agent_rules.md -> .codex_memories/project_state.md -> .codex_memories/system_prompt.md -> .codex_memories/daily_summary.md -> .codex_memories/YYYY-MM-DD/revival_summary.md -> .codex_memories/YYYY-MM-DD/task_log.md

## Start of Task Checklist
1. **Mandatory Load:** Trace from `AGENTS.md` and read `.codex_memories/_agent_rules.md` (this file).
2. **State Load:** Read `.codex_memories/project_state.md` to see stable facts and active threads.
3. **Protocol Load:** Read `.codex_memories/system_prompt.md` and `.codex_memories/daily_summary.md`.
4. **Daily Hub Creation:** If a `.codex_memories/YYYY-MM-DD/` folder for today does not exist, create it.
5. **Session Revival:** On the *first task of a new day*, read yesterday's folder. Write a `revival_summary.md` inside *today's* folder to bootstrap context.
6. **Detail Budget:** Load artifact files only when the daily index files are not enough. Do not read entire history by default.

## Navigation & Work Logic
7. **Architectural Guardrails:** Target project architecture is in `/ARCHITECTURE.md` and UI design is in `/DESIGN.md`. Do NOT use these files for your AI engine memory. They are strictly for the application you are building.
8. **Dynamic Discovery:** Whenever you enter a code directory, look for a `folder_map.md`. If missing, generate one so future agents can parse the directory structure without reading every dense codebase file.
9. **Small-File Rule:** Root files stay compact. Prefer one concern per file and create small files under `.codex_memories/YYYY-MM-DD/artifacts/` for detailed debugging, verification, migrations, or long requests.

## End of Task Checklist
10. **Conversations:** Inside today's `YYYY-MM-DD/` folder, create or append to `message_pairs.md`. Keep it concise. If the exact user prompt is long, store it in an artifact file and reference it from `message_pairs.md`.
11. **Task Log:** Inside today's `YYYY-MM-DD/` folder, create or append to `task_log.md`. Log only the high-signal summary of what was coded, debugged, and blocked during this run.
12. **Final Summarization:** Maintain an `end_of_day_summary.md` in today's folder. Keep it short and action-oriented so tomorrow's agent can scan it quickly.
13. **State Update:** Update your specific agent thread in `.codex_memories/project_state.md`.
14. **Split Early:** If any memory file starts to sprawl, split it into a new artifact file instead of continuing to append.

## Memory Root
- Write all reusable session memory only under `.codex_memories/`.
- Do not create or use any alternate memory root.
