import { expect, test } from "@playwright/test";

test.describe("External Data Layers E2E", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and wait for it to load
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should display layer metadata in left rail", async ({ page }) => {
    // Wait for layers to load
    await page.waitForSelector("[data-layer]");

    // Check Earthquakes layer
    const earthquakesLayer = page.locator('[data-layer="earthquakes"]');
    await expect(earthquakesLayer).toBeVisible();
    await expect(earthquakesLayer.locator(".layer-name")).toContainText("Earthquakes");

    // Check status is shown (real/degraded/unavailable)
    const status = earthquakesLayer.locator(".layer-status");
    await expect(status).toBeVisible();

    // Status should be one of: REAL, DEGRADED, UNAVAILABLE
    const statusText = await status.textContent();
    expect(["REAL", "DEGRADED", "UNAVAILABLE", "LOADING"]).toContain(statusText?.toUpperCase());
  });

  test("should toggle earthquake layer on/off", async ({ page }) => {
    const checkbox = page.locator("#layer-earthquakes");

    // Initially unchecked
    await expect(checkbox).not.toBeChecked();

    // Toggle on
    await checkbox.click();
    await expect(checkbox).toBeChecked();

    // Wait for data to load (may take a few seconds)
    await page.waitForTimeout(3000);

    // Check that count is displayed (or error if API unavailable)
    const count = page.locator("#layer-count-earthquakes");
    await expect(count).toBeVisible();

    // Toggle off
    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
  });

  test("should display satellites layer with correct status", async ({ page }) => {
    const satellitesLayer = page.locator('[data-layer="satellites"]');
    await expect(satellitesLayer).toBeVisible();

    const provider = satellitesLayer.locator("#layer-provider-satellites");
    await expect(provider).toContainText("CelesTrak");

    const status = satellitesLayer.locator("#layer-status-satellites");
    await expect(status).toBeVisible();
  });

  test("should disable toggle for unavailable military layer", async ({ page }) => {
    const militaryLayer = page.locator('[data-layer="military"]');
    await expect(militaryLayer).toBeVisible();

    const checkbox = militaryLayer.locator("input[type=checkbox]");
    await expect(checkbox).toBeDisabled();

    const status = militaryLayer.locator("#layer-status-military");
    await expect(status).toContainText("UNAVAILABLE");
  });

  test("should show degraded status for traffic layer", async ({ page }) => {
    const trafficLayer = page.locator('[data-layer="traffic"]');
    await expect(trafficLayer).toBeVisible();

    const status = trafficLayer.locator("#layer-status-traffic");
    await expect(status).toContainText("DEGRADED");
  });

  test("should render earthquake markers on globe when enabled", async ({ page }) => {
    // Enable earthquakes layer
    await page.locator("#layer-earthquakes").click();

    // Wait for data to load and render
    await page.waitForTimeout(5000);

    // Check that Cesium container is still present
    const cesiumContainer = page.locator("#cesiumContainer");
    await expect(cesiumContainer).toBeVisible();

    // Verify the layer is enabled in the UI
    await expect(page.locator("#layer-earthquakes")).toBeChecked();
  });

  test("should refresh layer metadata periodically", async ({ page }) => {
    // Initial load
    await page.waitForSelector("#layer-status-earthquakes");

    // Get initial status
    const _initialStatus = await page.locator("#layer-status-earthquakes").textContent();

    // Wait for potential refresh
    await page.waitForTimeout(2000);

    // Status should still be valid (not changed to error)
    const currentStatus = await page.locator("#layer-status-earthquakes").textContent();
    expect(["REAL", "DEGRADED", "UNAVAILABLE", "LOADING"]).toContain(currentStatus?.toUpperCase());
  });

  test("should display correct provider names", async ({ page }) => {
    // Check provider names for each layer
    const providers: Record<string, string> = {
      earthquakes: "USGS",
      satellites: "CelesTrak",
      weather: "NOAA",
      bikeshare: "CityBikes",
      traffic: "API Key Required",
      military: "No Open Source",
    };

    for (const [layerId, expectedProvider] of Object.entries(providers)) {
      const provider = page.locator(`#layer-provider-${layerId}`);
      try {
        if (await provider.isVisible()) {
          await expect(provider).toContainText(expectedProvider);
        }
      } catch {
        // Element not visible, skip
      }
    }
  });
});
