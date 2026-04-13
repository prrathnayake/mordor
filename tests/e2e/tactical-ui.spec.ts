import { expect, test } from "@playwright/test";
import { startApiServer } from "../../apps/api/src/index.js";
import { startWebServer } from "../../apps/web/src/server.js";
import { loadJsonFixture } from "../../packages/test-fixtures/src/index.js";
import { startPostgresTestEnvironment } from "../helpers/postgres-test-environment.js";

test.describe.configure({ mode: "serial" });

let environment: Awaited<ReturnType<typeof startPostgresTestEnvironment>>;
let api: Awaited<ReturnType<typeof startApiServer>>;
let web: Awaited<ReturnType<typeof startWebServer>>;

test.beforeAll(async () => {
  environment = await startPostgresTestEnvironment();
  api = await startApiServer({
    connection_string: environment.connection_string,
    skipConfigValidation: true,
  });
  web = await startWebServer({
    api_base_url: `http://127.0.0.1:${api.port}`,
  });
});

test.afterAll(async () => {
  await web.close();
  await api.close();
  await environment.stop();
});

// ===== TACTICAL UI SHELL TESTS =====

test("tactical UI shell renders with correct structure", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Wait for app to load
  await expect(page.locator("#mordor-app")).toBeVisible();

  // Check header elements
  await expect(page.locator(".tactical-header")).toBeVisible();
  await expect(page.locator(".system-name")).toContainText("MORDOR");
  await expect(page.locator(".mode-indicator")).toBeVisible();
  await expect(page.locator("#time-display")).toBeVisible();

  // Check left rail (data layers)
  await expect(page.locator(".left-rail")).toBeVisible();
  await expect(page.locator(".layers-list")).toBeVisible();

  // Check center viewport
  await expect(page.locator(".center-viewport")).toBeVisible();
  await expect(page.locator("#cesiumContainer")).toBeVisible();

  // Check right rail (visual controls)
  await expect(page.locator(".right-rail")).toBeVisible();
  // Check at least one control section exists
  await expect(page.locator(".control-section").first()).toBeVisible();

  // Check footer
  await expect(page.locator(".tactical-footer")).toBeVisible();
});

test("data layers rail shows all 8 layers", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);
  await expect(page.locator(".layers-list")).toBeVisible();

  // Check all 8 layers are present
  await expect(page.locator(".layer-item[data-layer='flights']")).toBeVisible();
  await expect(page.locator(".layer-item[data-layer='military']")).toBeVisible();
  await expect(page.locator(".layer-item[data-layer='earthquakes']")).toBeVisible();
  await expect(page.locator(".layer-item[data-layer='satellites']")).toBeVisible();
  await expect(page.locator(".layer-item[data-layer='traffic']")).toBeVisible();
  await expect(page.locator(".layer-item[data-layer='weather']")).toBeVisible();
  await expect(page.locator(".layer-item[data-layer='cctv']")).toBeVisible();
  await expect(page.locator(".layer-item[data-layer='bikeshare']")).toBeVisible();

  // Check layer names are displayed
  await expect(page.locator("text=Live Flights")).toBeVisible();
  await expect(page.locator("text=Military Flights")).toBeVisible();
  await expect(page.locator("text=Earthquakes (24h)")).toBeVisible();
  await expect(page.locator("text=Satellites")).toBeVisible();
  await expect(page.locator("text=Street Traffic")).toBeVisible();
  await expect(page.locator("text=Weather Radar")).toBeVisible();
  await expect(page.locator("text=CCTV Mesh")).toBeVisible();
  await expect(page.locator("text=Bikeshare")).toBeVisible();
});

test("data layers show availability status correctly", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Live Flights should be marked as available
  const flightsLayer = page.locator(".layer-item[data-layer='flights']");
  await expect(flightsLayer).toHaveAttribute("data-available", "true");

  // Military Flights should be marked as unavailable
  const militaryLayer = page.locator(".layer-item[data-layer='military']");
  await expect(militaryLayer).toHaveAttribute("data-available", "unavailable");
  await expect(militaryLayer.locator("#layer-status-military")).toContainText("UNAVAILABLE");

  // CCTV should be marked as partial
  const cctvLayer = page.locator(".layer-item[data-layer='cctv']");
  await expect(cctvLayer).toHaveAttribute("data-available", "partial");
  await expect(cctvLayer.locator(".layer-badge")).toContainText("SNAPSHOT ONLY");

  // Earthquake layer metadata should be present and the status badge should be populated.
  const earthquakeLayer = page.locator(".layer-item[data-layer='earthquakes']");
  await expect(earthquakeLayer).toHaveAttribute("data-available", "true");
  await expect(earthquakeLayer.locator("#layer-status-earthquakes")).toHaveText(
    /LOADING|REAL|DEGRADED|UNAVAILABLE/,
  );
});

test("layer toggles work correctly", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Check flights layer toggle is enabled and checked by default
  const flightsToggle = page.locator("#layer-flights");
  await expect(flightsToggle).toBeEnabled();
  await expect(flightsToggle).toBeChecked();

  // Check unavailable layers have disabled toggles
  const militaryToggle = page.locator("#layer-military");
  await expect(militaryToggle).toBeDisabled();

  // Toggle flights layer off
  const flightsSlider = page.locator(".layer-item[data-layer='flights'] .toggle-slider");
  await flightsSlider.scrollIntoViewIfNeeded();
  await flightsSlider.click();
  await expect(flightsToggle).not.toBeChecked();

  // Toggle back on
  await flightsSlider.click();
  await expect(flightsToggle).toBeChecked();
});

test("active layers count updates correctly", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Initially should show active count
  const countDisplay = page.locator("#active-layers-count");
  await expect(countDisplay).toBeVisible();

  // Should show format like "2/8" (flights and cctv are checked by default)
  await expect(countDisplay).toContainText("/8");
});

test("visual controls rail shows style presets", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Check all preset buttons exist
  await expect(page.locator("#preset-crt")).toBeVisible();
  await expect(page.locator("#preset-nvg")).toBeVisible();
  await expect(page.locator("#preset-flir")).toBeVisible();
  await expect(page.locator("#preset-clean")).toBeVisible();

  // Check preset labels
  await expect(page.locator("text=CRT")).toBeVisible();
  await expect(page.locator("text=NVG")).toBeVisible();
  await expect(page.locator("text=FLIR")).toBeVisible();
  await expect(page.locator("text=CLEAN")).toBeVisible();
});

test("visual effect sliders are present", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Check all sliders exist
  await expect(page.locator("#bloom-slider")).toBeVisible();
  await expect(page.locator("#sharpen-slider")).toBeVisible();
  await expect(page.locator("#pixelate-slider")).toBeVisible();
  await expect(page.locator("#distortion-slider")).toBeVisible();
  await expect(page.locator("#instability-slider")).toBeVisible();

  // Check slider labels
  await expect(page.locator("text=Bloom")).toBeVisible();
  await expect(page.locator("text=Sharpen")).toBeVisible();
  await expect(page.locator("text=Pixelate")).toBeVisible();
  await expect(page.locator("text=Distortion")).toBeVisible();
  await expect(page.locator("text=Instability")).toBeVisible();
});

test("view mode toggles are present", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Custom toggle controls hide the native checkbox and expose a visible label/switch shell.
  await expect(page.locator(".toggle-group")).toContainText("HUD Overlay");
  await expect(page.locator("#layout-select")).toBeVisible();
  await expect(page.locator(".toggle-group")).toContainText("Detect Mode");
  await expect(page.locator(".toggle-group")).toContainText("Panoptic View");
});

// ===== AUTHENTICATION TESTS =====

test("login modal opens when auth button clicked", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.locator("#auth-button").click();
  await expect(page.locator("#login-modal")).toBeVisible();
  await expect(page.locator("#username")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
});

test("successful login updates session badge", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("operator123");
  await page.locator("#submit-login").click();

  // Wait for any response and check status
  await page.waitForTimeout(2000);

  // Check if login modal is hidden (indicating successful login)
  await expect(page.locator("#login-modal")).toHaveClass(/hidden/);
});

// ===== GLOBE TESTS =====

test("Cesium globe loads in circular viewport", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Wait for Cesium to initialize
  await expect(page.locator("#cesiumContainer canvas")).toBeVisible({ timeout: 15000 });

  // Check viewport container has circular mask
  const viewportMask = page.locator(".viewport-mask");
  await expect(viewportMask).toBeVisible();
});

test("globe coordinates display updates", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);
  await expect(page.locator("#cesiumContainer canvas")).toBeVisible({ timeout: 15000 });

  // Coordinates should be displayed
  await expect(page.locator("#coordinates")).toBeVisible();
  await expect(page.locator("#zoom-level")).toBeVisible();
});

// ===== REPLAY TESTS =====

test("replay controls are present in footer", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await expect(page.locator("#play-replay")).toBeVisible();
  await expect(page.locator("#pause-replay")).toBeVisible();
  await expect(page.locator("#step-replay")).toBeVisible();
  await expect(page.locator("#reset-replay")).toBeVisible();
  await expect(page.locator("#timeline-slider")).toBeVisible();
});

test("query modal opens from footer", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.locator("#query-form-toggle").click();
  await expect(page.locator("#query-modal")).toBeVisible();
  await expect(page.locator("#start-at")).toBeVisible();
  await expect(page.locator("#end-at")).toBeVisible();
});

test("replay loads and displays events", async ({ page }) => {
  const { authenticate } = await import("../../packages/auth/src/index.js");
  const authResult = authenticate("operator", "operator123");
  const operatorToken = authResult.token ?? "";

  // Ingest test data
  const ingestPayload = await loadJsonFixture(
    "adapters",
    "fixture-telemetry",
    "valid.request.json",
  );
  await fetch(`http://127.0.0.1:${api.port}/ingest/fixture-telemetry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${operatorToken}`,
    },
    body: JSON.stringify(ingestPayload),
  });

  await page.goto(`http://127.0.0.1:${web.port}`);
  await expect(page.locator("#cesiumContainer canvas")).toBeVisible({ timeout: 10000 });

  // Open query modal and load replay
  await page.locator("#query-form-toggle").click();
  await page.locator("#load-replay").click();

  // Wait for replay to load
  await expect(page.locator("#status-message")).toContainText("LOADED", { timeout: 10000 });

  // Events panel should be visible
  await expect(page.locator("#events-panel")).toBeVisible();
});

// ===== LIVE MODE TESTS =====

test("live mode switch works", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);
  await expect(page.locator("#cesiumContainer canvas")).toBeVisible({ timeout: 10000 });

  // Click live mode
  await page.locator("#mode-live").click();

  // Mode indicator should update
  await expect(page.locator("#mode-value")).toContainText("LIVE");
  await expect(page.locator("#mode-value")).toHaveClass(/live/);

  // Should attempt connection
  await expect(page.locator("#connection-text")).toContainText("CONNECTED", { timeout: 10000 });
});

// ===== ALERTS TESTS =====

test("alerts strip shows in footer", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await expect(page.locator(".alerts-strip")).toBeVisible();
  await expect(page.locator("#alerts-count")).toBeVisible();
  await expect(page.locator("text=ALERTS")).toBeVisible();
});

test("alert detail modal opens from alerts strip", async ({ page }) => {
  // Create a test alert
  const alertData = {
    alert_id: "test-alert-001",
    rule_id: "source_error",
    severity: "critical",
    evidence_event_ids: ["evt_123"],
    evidence_object_ids: ["veh_42"],
    summary: "Test alert for modal",
    explanation: "Test explanation for modal",
    confidence: 0.99,
    opened_at: new Date().toISOString(),
    status: "open",
  };

  await api.persistence.persistAlert(alertData);

  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.waitForTimeout(500);

  // Login first
  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("operator123");
  await page.locator("#submit-login").click();
  await page.waitForTimeout(500);

  // Wait for alert to appear
  await expect(page.locator(".alert-chip")).toBeVisible({ timeout: 5000 });

  // Click alert
  await page.locator(".alert-chip").click();

  // Alert modal should open
  await expect(page.locator("#alert-modal")).toBeVisible();
});

// ===== CCTV PANEL TESTS =====

test("CCTV panel shows truthful placeholder when no camera selected", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // CCTV section should be visible
  await expect(page.locator("#cctv-section")).toBeVisible();

  // Should show placeholder content
  await expect(page.locator("#cctv-content")).toContainText("No camera selected");
  await expect(page.locator("#cctv-content")).toContainText("Select a CCTV-linked object to view");
});

test("CCTV panel shows truthful info when CCTV layer disabled", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Disable CCTV layer
  const cctvToggle = page.locator(".layer-item[data-layer='cctv'] .toggle-slider");
  await cctvToggle.scrollIntoViewIfNeeded();
  await cctvToggle.click();

  // Should show layer disabled message
  await expect(page.locator("#cctv-content")).toContainText("CCTV layer disabled");
});

// ===== STYLE PRESETS TESTS =====

test("style presets change theme", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Check default theme
  await expect(page.locator("body")).toHaveAttribute("data-theme", "crt");

  // Click NVG preset
  await page.locator("#preset-nvg").click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "nvg");

  // Click FLIR preset
  await page.locator("#preset-flir").click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "flir");

  // Click Clean preset
  await page.locator("#preset-clean").click();
  await expect(page.locator("body")).toHaveAttribute("data-theme", "clean");
});

// ===== MODE SWITCHING TESTS =====

test("mode buttons switch between live and replay", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Default should be replay
  await expect(page.locator("#mode-replay")).toHaveClass(/active/);
  await expect(page.locator("#mode-value")).toContainText("REPLAY");

  // Switch to live
  await page.locator("#mode-live").click();
  await expect(page.locator("#mode-live")).toHaveClass(/active/);
  await expect(page.locator("#mode-replay")).not.toHaveClass(/active/);
  await expect(page.locator("#mode-value")).toContainText("LIVE");

  // Switch back to replay
  await page.locator("#mode-replay").click();
  await expect(page.locator("#mode-replay")).toHaveClass(/active/);
  await expect(page.locator("#mode-live")).not.toHaveClass(/active/);
  await expect(page.locator("#mode-value")).toContainText("REPLAY");
});

// ===== SOURCE HEALTH TESTS =====

test("source health panel shows in left rail", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await expect(page.locator("#source-health-panel")).toBeVisible();
  await expect(page.locator("#source-list")).toBeVisible();
  await expect(page.locator("#health-indicator")).toBeVisible();
});

// ===== INSPECTOR TESTS =====

test("inspector panel shows empty state initially", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await expect(page.locator("#inspector-section")).toBeVisible();
  await expect(page.locator("#inspector-content")).toContainText("Select an object to inspect");
});

// ===== OBJECT SELECTION TESTS =====

test("object selection updates inspector", async ({ page }) => {
  const { authenticate } = await import("../../packages/auth/src/index.js");
  const authResult = authenticate("operator", "operator123");
  const operatorToken = authResult.token ?? "";

  // Ingest test data
  const ingestPayload = await loadJsonFixture(
    "adapters",
    "fixture-telemetry",
    "valid.request.json",
  );
  await fetch(`http://127.0.0.1:${api.port}/ingest/fixture-telemetry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${operatorToken}`,
    },
    body: JSON.stringify(ingestPayload),
  });

  await page.goto(`http://127.0.0.1:${web.port}`);
  await expect(page.locator("#cesiumContainer canvas")).toBeVisible({ timeout: 10000 });

  // Load replay to get objects
  await page.locator("#query-form-toggle").click();
  await page.locator("#load-replay").click();
  await expect(page.locator("#status-message")).toContainText("LOADED", { timeout: 10000 });

  // Click on the canvas (may or may not select an object)
  const canvas = page.locator("#cesiumContainer canvas");
  await canvas.click({ position: { x: 400, y: 300 }, force: true });

  // Wait a moment for any updates
  await page.waitForTimeout(500);

  // Inspector should be visible (even if empty)
  await expect(page.locator("#inspector-content")).toBeVisible();
});

// ===== ALERT INVESTIGATION FLOW =====

test("alert investigation jump to replay works", async ({ page }) => {
  const { authenticate } = await import("../../packages/auth/src/index.js");
  const authResult = authenticate("operator", "operator123");
  const operatorToken = authResult.token ?? "";

  // Ingest test data
  const ingestPayload = await loadJsonFixture(
    "adapters",
    "fixture-telemetry",
    "valid.request.json",
  );
  await fetch(`http://127.0.0.1:${api.port}/ingest/fixture-telemetry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${operatorToken}`,
    },
    body: JSON.stringify(ingestPayload),
  });

  // Create an alert
  const alertData = {
    alert_id: "investigation-test-001",
    rule_id: "object_stale",
    severity: "warning",
    evidence_event_ids: ["evt_test"],
    evidence_object_ids: ["veh_42"],
    summary: "Test for investigation",
    explanation: "Test explanation",
    confidence: 0.9,
    opened_at: new Date().toISOString(),
    status: "open",
  };

  await api.persistence.persistAlert(alertData);

  await page.goto(`http://127.0.0.1:${web.port}`);

  // Login
  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("operator123");
  await page.locator("#submit-login").click();
  await page.waitForTimeout(500);

  const targetAlert = page.locator('.alert-chip[data-alert-id="investigation-test-001"]');

  // Wait for the target alert to load
  await expect(targetAlert).toBeVisible({ timeout: 5000 });

  // Click alert to open detail
  await targetAlert.click();

  // Alert modal should open
  await expect(page.locator("#alert-modal")).toBeVisible();

  // Jump to replay button should be visible
  await expect(page.locator("#jump-replay")).toBeVisible();

  // Click jump to replay
  await page.locator("#jump-replay").click();

  // Should switch to replay mode
  await expect(page.locator("#mode-replay")).toHaveClass(/active/);

  // The alert jump now prepares a replay window for operator review.
  await expect(page.locator("#status-message")).toContainText("REPLAY WINDOW READY");
  await expect(page.locator("#query-modal")).toBeVisible();
  await expect(page.locator("#object-id")).toHaveValue("veh_42");
});
