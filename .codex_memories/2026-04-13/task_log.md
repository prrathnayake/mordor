# Task Log

Use timestamped entries in local time (`Australia/Melbourne`) for each completed task.

- 2026-04-13 09:56:17 +10:00: Mapped the Chrona Twin project goal and current architecture from code and docs, refreshed `README.md`, `docs/ARCHITECTURE_OVERVIEW.md`, `docs/INDEX.md`, and `docs/OPS_LOCAL_RUN.md`, fixed runtime port/default API-base mismatches, corrected nearest-source distance calculations to return meters in both persistence and SWAN paths, hardened API invalid-JSON handling to return `400 invalid_json`, and re-ran lint, typecheck, and focused unit suites. Integration/e2e validation remains blocked locally because `testcontainers` could not find a working container runtime.
- 2026-04-13 11:46:05 +10:00: Reviewed broad runtime and UI paths, fixed replay/alert/CCTV UI issues, stabilized shared Postgres testcontainers setup and auth teardown helpers, corrected an external-data HTTP retry/rate-limit bug and stale unit tests, hardened API shutdown to drain active requests before closing Postgres, refreshed failing integration/e2e specs, and verified the final tree with a full green `npm run validate` (`33` Vitest files / `269` tests, `127` Playwright tests).
