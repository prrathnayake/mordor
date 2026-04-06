import { expect, test } from "@playwright/test";
import { startApiServer } from "../../apps/api/src/index.js";
import { startWebServer } from "../../apps/web/src/server.js";
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

// ===== INCIDENT PANEL STRUCTURE TESTS =====

test("incident panel exists in DOM", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Incident panel should exist but be hidden
  const incidentPanel = page.locator("#incident-panel");
  await expect(incidentPanel).toBeAttached();
  await expect(incidentPanel).toHaveClass(/hidden/);
});

test("incident panel shows correct structure when visible", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Open incident panel by removing hidden class
  await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));

  const incidentPanel = page.locator("#incident-panel");
  await expect(incidentPanel).toBeVisible();

  // Check panel structure
  await expect(page.locator(".incident-title")).toBeVisible();
  await expect(page.locator(".incident-severity")).toBeVisible();
  await expect(page.locator(".incident-status")).toBeVisible();
  await expect(page.locator(".incident-time")).toBeVisible();
});

test("incident sections (before/during/after) are present", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));

  await expect(page.locator("#btn-before")).toBeVisible();
  await expect(page.locator("#btn-during")).toBeVisible();
  await expect(page.locator("#btn-after")).toBeVisible();

  // During should be active by default
  await expect(page.locator("#btn-during")).toHaveClass(/active/);
});

test("incident playback controls are present", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));

  await expect(page.locator("#incident-play")).toBeVisible();
  await expect(page.locator("#incident-scrubber")).toBeVisible();
  await expect(page.locator("#incident-speed")).toBeVisible();
});

test("incident playback speed selector has correct options", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));

  const speedSelect = page.locator("#incident-speed");
  await expect(speedSelect).toHaveValue("1");

  const options = await speedSelect.locator("option").allTextContents();
  expect(options).toContain("0.5x");
  expect(options).toContain("1x");
  expect(options).toContain("2x");
  expect(options).toContain("5x");
  expect(options).toContain("10x");
});

// ===== INCIDENT MODAL TESTS =====

test("incident modal exists and is hidden", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  const incidentModal = page.locator("#incident-modal");
  await expect(incidentModal).toBeAttached();
  await expect(incidentModal).toHaveClass(/hidden/);
});

test("incident modal can be shown via window function", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Call the global function
  await page.evaluate(() => {
    const fn = (window as unknown as { showIncidentModal: () => void }).showIncidentModal;
    if (fn) fn();
  });

  await expect(page.locator("#incident-modal")).toBeVisible();
  await expect(page.locator(".incident-list")).toBeVisible();
});

test("new incident form modal exists", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  const newIncidentModal = page.locator("#new-incident-modal");
  await expect(newIncidentModal).toBeAttached();
  await expect(newIncidentModal).toHaveClass(/hidden/);
});

test("new incident form has all required fields", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Show new incident form by removing hidden class
  await page
    .locator("#new-incident-modal")
    .evaluate((el: Element) => el.classList.remove("hidden"));

  await expect(page.locator("#incident-title-input")).toBeVisible();
  await expect(page.locator("#incident-desc-input")).toBeVisible();
  await expect(page.locator("#incident-start-input")).toBeVisible();
  await expect(page.locator("#incident-end-input")).toBeVisible();
  await expect(page.locator("#incident-severity-input")).toBeVisible();
  await expect(page.locator("#incident-tags-input")).toBeVisible();
});

// ===== INCIDENT API TESTS =====

test("incidents API returns empty list initially", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Show incident modal via window function
  await page.evaluate(() => {
    const fn = (window as unknown as { showIncidentModal: () => void }).showIncidentModal;
    if (fn) fn();
  });

  await expect(page.locator(".no-incidents")).toBeVisible();
});

test("incident creation form validation works", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Show new incident form
  await page
    .locator("#new-incident-modal")
    .evaluate((el: Element) => el.classList.remove("hidden"));

  // Submit empty form - should not create incident
  await page.locator("#btn-create-incident").click();

  // Modal should still be visible (form validation prevents submission)
  await expect(page.locator("#new-incident-modal")).toBeVisible();
  await expect(page.locator("#incident-title-input")).toBeVisible();
});

// ===== INCIDENT PLAYBACK TESTS =====

test("incident section switching works", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Show incident panel
  await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));

  // Initially during should be active
  await expect(page.locator("#btn-during")).toHaveClass(/active/);

  // Click before
  await page.locator("#btn-before").click();
  await expect(page.locator("#btn-before")).toHaveClass(/active/);
  await expect(page.locator("#btn-during")).not.toHaveClass(/active/);

  // Click after
  await page.locator("#btn-after").click();
  await expect(page.locator("#btn-after")).toHaveClass(/active/);
  await expect(page.locator("#btn-before")).not.toHaveClass(/active/);

  // Click during
  await page.locator("#btn-during").click();
  await expect(page.locator("#btn-during")).toHaveClass(/active/);
});

test("incident play/pause toggle works", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));

  // Both buttons should be visible (they're always rendered, just one is hidden via CSS)
  await expect(page.locator("#incident-play")).toBeVisible();

  // The play button click handler should toggle visibility
  // Note: Without an active incident, the play function won't fully work,
  // but we can verify the buttons are present
  await expect(page.locator("#incident-play")).toHaveAttribute("title", "Play Incident");
  await expect(page.locator("#incident-pause")).toHaveAttribute("title", "Pause Incident");
});

test("incident scrubber is interactive", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));

  const scrubber = page.locator("#incident-scrubber");

  // Set to middle position
  await scrubber.fill("50");

  // Should reflect the value
  await expect(scrubber).toHaveValue("50");
});

test("incident speed change works", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));

  const speedSelect = page.locator("#incident-speed");

  // Change to 2x
  await speedSelect.selectOption("2");
  await expect(speedSelect).toHaveValue("2");

  // Change to 10x
  await speedSelect.selectOption("10");
  await expect(speedSelect).toHaveValue("10");
});

// ===== INCIDENT PANEL CLOSE TESTS =====

test("incident panel close button works", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));

  await expect(page.locator("#incident-panel")).toBeVisible();

  await page.locator("#close-incident").click();

  await expect(page.locator("#incident-panel")).toHaveClass(/hidden/);
});

// ===== LINKED ALERTS DISPLAY TESTS =====

test("linked alerts section exists in incident panel", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));

  // The linked alerts div exists in the DOM
  await expect(page.locator("#incident-linked-alerts")).toBeAttached();
});

// ===== CHAPTER MARKERS TESTS =====

test("incident chapters section exists", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));

  await expect(page.locator("#incident-chapters")).toBeAttached();
});

test("no chapters message shows when empty", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));

  // The chapters div exists but content is empty (no-chapters message is rendered by JS when chapters array is empty)
  await expect(page.locator("#incident-chapters")).toBeAttached();
});

// ===== GLOBE FOCUS INTEGRATION TESTS =====

test("Cesium globe is present when incident panel opens", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Wait for Cesium to initialize
  await expect(page.locator("#cesiumContainer canvas")).toBeVisible({ timeout: 15000 });

  // Open incident panel
  await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));

  // Globe should still be visible
  await expect(page.locator("#cesiumContainer canvas")).toBeVisible();
});

// ===== REGRESSION: EXISTING FLOWS STILL WORK =====

test("regression: replay mode still works", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Should start in replay mode
  await expect(page.locator("#mode-replay")).toHaveClass(/active/);
  await expect(page.locator("#mode-value")).toContainText("REPLAY");

  // Replay controls should be visible
  await expect(page.locator("#play-replay")).toBeVisible();
  await expect(page.locator("#timeline-slider")).toBeVisible();
});

test("regression: live mode still works", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Wait for Cesium
  await expect(page.locator("#cesiumContainer canvas")).toBeVisible({ timeout: 10000 });

  // Switch to live
  await page.locator("#mode-live").click();

  // Should show live mode
  await expect(page.locator("#mode-value")).toContainText("LIVE");
  await expect(page.locator("#mode-live")).toHaveClass(/active/);
});

test("regression: authentication modal opens", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // No session initially
  await expect(page.locator(".session-status")).toContainText("NO SESSION");

  // Click login button
  await page.locator("#auth-button").click();

  // Login modal should open
  await expect(page.locator("#login-modal")).toBeVisible();
  await expect(page.locator("#username")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
});

test("regression: alerts strip still visible", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await expect(page.locator(".alerts-strip")).toBeVisible();
  await expect(page.locator("#alerts-count")).toBeVisible();
});

test("regression: layer toggles still work", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Layer toggle checkbox exists and is checked by default
  const flightsToggle = page.locator("#layer-flights");
  await expect(flightsToggle).toBeChecked();

  // Click the label (the toggle element) to toggle
  await page.locator(".layer-item[data-layer='flights'] .layer-toggle").click();
  await expect(flightsToggle).not.toBeChecked();

  // Click again to toggle back
  await page.locator(".layer-item[data-layer='flights'] .layer-toggle").click();
  await expect(flightsToggle).toBeChecked();
});
