# Revival Summary - 2026-04-25

**Project:** Chrona Twin
**Branch:** main preferred by instructions; current observed checkout is `master`.
**Last work:** Added global intelligence source catalog capabilities, an `/intelligence/sources` API, database tables for source/media observations, an enabled Global Intel Sources globe layer, embedded media-capable location popups, and source-catalog right-rail UI behavior.

**Key context:**
- Current modified UI files: `apps/web/public/app.js`, `apps/web/public/dashboard.js`, `apps/web/public/index.html`, `apps/web/public/tactical-styles.css`.
- New source catalog files: `packages/intelligence/src/source-catalog.ts` and `infra/migrations/0011_intelligence_source_catalog.sql`.
- API now exposes `GET /intelligence/sources`, backed by the static intelligence source catalog.
- The Data Layers rail now has 9 layers including `Global Intel Sources`, enabled by default.
- The Intelligence right-rail panel falls back to the source catalog when no entity is selected.
- Source catalog entries currently cover global hazards, disaster alerts, wildfire/thermal anomalies, air quality, space weather, satellites, earthquakes, live video/watch wall, maritime/coastal context, and cyber advisories.
- Embedded popups now support a safe YouTube/YouTube-nocookie iframe media area plus summary/tags/source metadata.
- News now has local fallback intelligence clusters when `/news` is unavailable or unauthenticated, so the panel can render during UI-only testing.
- Webcams now load immediately on app init instead of waiting for the first 60s smart poll, and also have local fallback TV channels when `/webcams` is unavailable.
- Clicking a news cluster opens a DOM-based earth popup anchored to the Cesium-projected location and clamped into view.
- Clicking a webcam/TV card opens a `TV` earth popup; cards have a transparent click overlay so iframe embeds do not swallow the click.
- The responsive rail CSS no longer pushes left/right rails offscreen at narrow widths without an opener; tabs remain reachable in the in-app browser.
- Added `tests/integration/tactical-media-contract.spec.ts` to lock the current `app.js` and `tactical-styles.css` media/info-panel behavior without editing app source.
- The web dev server was started on `http://127.0.0.1:3001/` with `API_BASE_URL=http://127.0.0.1:3999` for fallback-path testing.

**Verified green:**
- `npx vitest run tests/integration/tactical-media-contract.spec.ts` (4 tests)
- `npx biome check tests/integration/tactical-media-contract.spec.ts --no-errors-on-unmatched`
- Browser-tested the local UI in the in-app browser.
- Confirmed News fallback renders 2 clusters and a visible `N` globe popup.
- Confirmed Webcams fallback renders 3 TV channels and a visible `TV` globe popup.
- Confirmed the Intelligence tab shows source catalog metrics/layers after fallback loading.
- Confirmed Webcams fallback popup includes an embedded iframe player.
- `node --check apps/web/public/app.js`
- `node --check apps/web/public/dashboard.js`
- `npm run typecheck`
- `npm run lint`
- `npx vitest run tests/integration/tactical-media-contract.spec.ts tests/integration/tactical-shell.spec.ts` (29 tests)

**Open notes:**
- The repo still has branch-name mismatch context (`master` locally, `main` preferred by instructions).
- Full Playwright e2e/`npm run validate` may still depend on Docker/Testcontainers availability from earlier work.
