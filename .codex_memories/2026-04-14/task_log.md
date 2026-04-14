# Task Log

Use timestamped entries in local time (`Australia/Sydney`) for each completed task.

- 2026-04-14 12:12:55 +10:00: Reorganized the repo to reduce root clutter and improve discoverability by moving Docker/compose support files into `infra/compose` and `infra/docker`, relocating current-state docs into topical `docs/architecture`, `docs/runbooks`, and `docs/tests` folders, refreshing `README.md`, `docs/INDEX.md`, `docs/README.md`, and `docs/09_REPOSITORY_STRUCTURE.md`, and verifying the required docs gate with `npm run gate:docs`. `npm run lint` remains red due to pre-existing formatting drift outside this reorganization pass.
