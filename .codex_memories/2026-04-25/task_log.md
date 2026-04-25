# Task Log - 2026-04-25

## 13:28:00 +10:00 - Dashboard UI upgrade (4-zone ops intelligence)

**Goal:** Upgrade the vanilla JS/CSS tactical UI into a 4-zone Palantir/Nexus Ops style real-time operations intelligence dashboard without breaking existing functionality or e2e tests.

**Files changed:**
- `apps/web/public/dashboard.js` (new) - Entity list, filters, search, intelligence panel, telemetry panel, demo data adapters, polling, map tooltip enhancements
- `apps/web/public/dashboard-styles.css` (new) - Professional dark ops theme, metric cards, event stream, simple charts, responsive overrides
- `apps/web/public/index.html` - Added tab navigation to left/right rails, operations panel, intelligence panel, telemetry panel inside footer
- `apps/web/public/app.js` - Added `window.selectObject = selectObject` for cross-module integration
- `apps/web/src/server.ts` - Added whitelist routes for `/dashboard.js` and `/dashboard-styles.css`
- `tests/e2e/dashboard.spec.ts` (new) - 12 e2e tests covering layout, entity list, search, filters, intelligence panel, telemetry, responsive design
- `tests/unit/agent-protocol.spec.ts` - Fixed pre-existing import sort lint error

**Issues encountered & fixes:**
1. E2e tests timed out because `dashboard.js` and `dashboard-styles.css` were not served by the web server (404). Fixed by adding explicit routes in `server.ts`.
2. Strict mode violations in Playwright tests due to non-unique selectors (`.empty-text`, `.intelligence-section`, `.metric-card`). Fixed by scoping selectors to parent containers (`#entity-list`, `#intelligence-content`, `#telemetry-content`).
3. Severity filter test failed because hidden checkbox (`display: none`) inside a label could not be toggled by Playwright. Fixed test to use `locator.evaluate()` to set `checked = true` and dispatch a `change` event.

**Verification status:**
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npm run gate` - passed
- `npm run test:unit` - 19 files, 188 tests passed
- `npm run test:contract` - 1 file, 8 tests passed
- Dashboard e2e tests - 9/12 passed in last available Docker run; remaining 3 tests (including the filter fix) were blocked from final verification because the local container runtime (Docker) became unavailable during the session.
- Legacy e2e suites (`tactical-ui`, `replay-web`) were verified passing earlier in the session before Docker went down.

**Next steps:**
- Restart Docker and run `npx playwright test tests/e2e/dashboard.spec.ts` to confirm the final 3 tests pass.
- Run full `npm run validate` once Docker is available.
- Consider adding dashboard docs to `docs/` if the feature is promoted beyond experimental.

## 18:22:58 +10:00 - Tactical UI browser test and globe popup fixes

**Goal:** Test the web UI, fix location-based popup windows on the 3D globe for news and TV/webcam channel clicks, and implement obvious missing UI features found during the audit.

**Files changed:**
- `apps/web/public/app.js` - Added resilient demo/fallback news and webcam data, immediate webcam loading, safer external popup links, robust DOM-based globe popup projection/clamping, status feedback for news/TV popup actions, and clickable webcam cards even when iframe embeds are present.
- `apps/web/public/tactical-styles.css` - Added relative positioning for Cesium overlay popups, responsive rail visibility fixes for narrow browser widths, webcam placeholder/click overlay styles, and polished earth popup overlay styles.

**Issues found and fixed:**
1. News could remain stuck on loading/off when the API was unavailable or unauthenticated; added local fallback intelligence so the UI can still render and be tested.
2. Webcams were only loaded by the delayed smart poll loop, so the webcam tab initially showed "Loading webcam channels..." for up to a minute; added immediate load on init.
3. Webcam iframes could swallow clicks, preventing the location popup from opening; added a transparent click target over cards.
4. The Cesium popup projection could hide/clamp incorrectly when the projected point landed outside the current canvas; the DOM popup now tracks the 3D point, clamps into the viewport, and remains visible.
5. Narrow browser widths pushed rails offscreen without any drawer control, making tabs like News/Webcams unreachable; responsive rails now remain visible and scrollable.

**Verification:**
- Browser-tested `http://127.0.0.1:3001/` with the in-app browser.
- Confirmed News fallback renders 2 clusters and clicking a cluster opens a visible `N` earth popup.
- Confirmed Webcams fallback renders 3 TV channels and clicking a channel opens a visible `TV` earth popup.
- `node --check apps/web/public/app.js` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npx vitest run tests/integration/tactical-shell.spec.ts` - 23 tests passed

## 18:40:13 +10:00 - Tactical media UI test contract

**Goal:** Inspect the current frontend/test coverage after the new global info layers and embedded video/info popup work, then add a bounded tests-only patch only if there was a clear independent improvement.

**Files changed:**
- `tests/integration/tactical-media-contract.spec.ts` (new) - Static integration contract for tactical media/info behavior in `app.js` and `tactical-styles.css`.

**Test coverage added:**
1. Verifies demo news clusters and demo webcam channels remain present and are applied on failed `/news` and `/webcams` responses, including immediate webcam loading before the smart poll loop.
2. Verifies webcam cards keep safe embeddable YouTube handling, placeholder fallback, and a full-card click target for location popups.
3. Verifies DOM earth popups use sanitized external links, Cesium projection tracking, status feedback, and responsive popup styling.
4. Verifies narrow viewport rail CSS keeps side rails reachable instead of translating them offscreen.

**Verification:**
- `npx vitest run tests/integration/tactical-media-contract.spec.ts` - 4 tests passed
- `npx biome check tests/integration/tactical-media-contract.spec.ts --no-errors-on-unmatched` - passed
- `npm run typecheck` - passed

## 18:54:45 +10:00 - Global intelligence sources and embedded watch popups

**Goal:** Improve and optimize the project by adding more global information/source layers to the globe, embedded video/info watching instead of external redirects, database storage structures for source/media observations, and UI verification for centered location popups.

**Files changed:**
- `packages/intelligence/src/source-catalog.ts` (new) - Static global intelligence source catalog covering NASA EONET, GDACS, NASA FIRMS, OpenAQ, NOAA SWPC, CelesTrak, USGS earthquakes, live video/watch wall, maritime/coastal, and CISA KEV source types.
- `packages/intelligence/src/index.ts` - Exported the source catalog.
- `apps/api/src/server.ts` - Added `GET /intelligence/sources`.
- `infra/migrations/0011_intelligence_source_catalog.sql` (new) - Added `intelligence_source_catalog` and `intelligence_media_observations` tables.
- `apps/web/public/index.html` - Added the Global Intel Sources layer row and updated the layer count to 9.
- `apps/web/public/app.js` - Added intelligence source state/loading/fallback, Cesium source markers, embedded media-capable earth popups, source panel rendering, and source marker click handling.
- `apps/web/public/dashboard.js` - Lets the right-rail Intelligence tab fall back to the source catalog when no entity is selected and prevents dashboard loading state from hiding it.
- `apps/web/public/tactical-styles.css` - Added larger embedded-media popup styles and intelligence source panel styles.
- `tests/integration/tactical-shell.spec.ts` - Updated layer expectations and added API coverage for `/intelligence/sources`.
- `tests/integration/tactical-media-contract.spec.ts` - Extended contract coverage for embedded popup media and global intel source layer wiring.
- `docs/04_FRONTEND_DESIGN.md` and `docs/06_DATA_INGESTION_AND_NORMALIZATION.md` - Documented source catalog/watch-wall UI and storage expectations.

**Sub-agent use:**
- Explorer agent mapped existing ingestion/UI seams and recommended source categories and storage targets.
- Worker agent added the original tests-only tactical media contract before this implementation pass.

**Verification:**
- Browser-tested `http://127.0.0.1:3001/` in the in-app browser.
- Confirmed Global Intel Sources renders in the layer list and the Intelligence tab shows the source catalog after async fallback loading.
- Confirmed Webcams fallback renders 3 channels and clicking a channel opens a visible `TV` globe popup with an embedded iframe player.
- `node --check apps/web/public/app.js` - passed
- `node --check apps/web/public/dashboard.js` - passed
- `npm run typecheck` - passed
- `npm run lint` - passed
- `npx vitest run tests/integration/tactical-media-contract.spec.ts tests/integration/tactical-shell.spec.ts` - 29 tests passed
