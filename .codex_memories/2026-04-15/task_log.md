# Task Log

Use timestamped entries in local time (`Australia/Sydney`) for each completed task.

- 2026-04-15 13:59:58 +10:00: Continued the incident-intelligence rollout by adding spatial `map_context` fusion in `packages/intelligence`, extending the tactical incident panel to render/focus map-context widgets and plot scoped AOI/intelligence markers on the globe, fixing incident AOI focusing to handle real GeoJSON coordinate nesting, adding focused docs updates plus a no-container unit spec for the new widget generation path, and verifying with `node --check apps/web/public/app.js`, `npm run typecheck`, and `npx vitest run tests/unit/incident-intelligence-service.spec.ts`; the existing Postgres integration specs for incident intelligence remain blocked locally by a missing container runtime for Testcontainers.
