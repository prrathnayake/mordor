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

// ===== DASHBOARD LAYOUT TESTS =====

test("dashboard renders with 4-zone structure", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await expect(page.locator("#mordor-app")).toBeVisible();

  // Left rail with tabs
  await expect(page.locator("#left-rail-tabs")).toBeVisible();
  await expect(page.locator("#left-rail-tabs .rail-tab[data-tab='layers']")).toBeVisible();
  await expect(page.locator("#left-rail-tabs .rail-tab[data-tab='operations']")).toBeVisible();

  // Right rail with tabs
  await expect(page.locator("#right-rail-tabs")).toBeVisible();
  await expect(page.locator("#right-rail-tabs .rail-tab[data-tab='visuals']")).toBeVisible();
  await expect(page.locator("#right-rail-tabs .rail-tab[data-tab='intelligence']")).toBeVisible();

  // Telemetry panel
  await expect(page.locator("#telemetry-panel")).toBeVisible();
});

// ===== OPERATIONS SIDEBAR TESTS =====

test("operations sidebar shows entity list with demo data", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Switch to Operations tab and wait for panel transition
  await page.locator("#left-rail-tabs .rail-tab[data-tab='operations']").click();
  await page.waitForSelector("#operations-panel:not(.hidden)");

  await expect(page.locator("#entity-search")).toBeVisible();
  await expect(page.locator("#entity-list")).toBeVisible();

  // Demo entities should render
  await expect(page.locator(".entity-card").first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".entity-card")).toHaveCount(6);
});

test("entity search filters entity list", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#left-rail-tabs .rail-tab[data-tab='operations']").click();
  await page.waitForSelector("#operations-panel:not(.hidden)");

  await expect(page.locator(".entity-card")).toHaveCount(6);

  await page.locator("#entity-search").fill("Alpha-42");
  await expect(page.locator(".entity-card")).toHaveCount(1);
  await expect(page.locator(".entity-card")).toContainText("Alpha-42");
});

test("empty state works when search yields no results", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#left-rail-tabs .rail-tab[data-tab='operations']").click();
  await page.waitForSelector("#operations-panel:not(.hidden)");

  await page.locator("#entity-search").fill("nonexistent-entity-xyz");
  await expect(page.locator("#entity-list .empty-state")).toBeVisible();
  await expect(page.locator("#entity-list .empty-text")).toContainText("No entities match filters");
});

test("clicking entity updates intelligence panel", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#left-rail-tabs .rail-tab[data-tab='operations']").click();
  await page.waitForSelector("#operations-panel:not(.hidden)");

  await expect(page.locator(".entity-card").first()).toBeVisible({ timeout: 5000 });
  await page.locator(".entity-card").first().click();

  // Switch to Intelligence tab to verify
  await page.locator("#right-rail-tabs .rail-tab[data-tab='intelligence']").click();
  await page.waitForSelector("#intelligence-panel:not(.hidden)");
  await expect(page.locator("#intelligence-content")).toContainText("STATUS");
  await expect(page.locator("#intelligence-content")).toContainText("AI INSIGHTS");
});

// ===== INTELLIGENCE PANEL TESTS =====

test("intelligence panel shows empty state initially", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#right-rail-tabs .rail-tab[data-tab='intelligence']").click();
  await page.waitForSelector("#intelligence-panel:not(.hidden)");

  await expect(page.locator("#intelligence-content")).toContainText(
    "Select an entity to view intelligence",
  );
});

test("intelligence panel renders entity details when selected", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Select an entity from operations sidebar
  await page.locator("#left-rail-tabs .rail-tab[data-tab='operations']").click();
  await page.waitForSelector("#operations-panel:not(.hidden)");
  await expect(page.locator(".entity-card").first()).toBeVisible({ timeout: 5000 });
  await page.locator(".entity-card[data-entity-id='veh_42']").click();

  // View intelligence panel
  await page.locator("#right-rail-tabs .rail-tab[data-tab='intelligence']").click();
  await page.waitForSelector("#intelligence-panel:not(.hidden)");

  await expect(page.locator(".intelligence-title")).toContainText("Alpha-42");
  await expect(page.locator("#intelligence-content")).toContainText("METRICS");
  await expect(page.locator("#intelligence-content")).toContainText("RELATIONSHIPS");
  await expect(page.locator("#intelligence-content")).toContainText("ALERTS");
  await expect(page.locator("#intelligence-content")).toContainText("RECENT EVENTS");
  await expect(page.locator(".insight-confidence")).toBeVisible();
});

// ===== TELEMETRY PANEL TESTS =====

test("telemetry panel renders metric cards", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await expect(page.locator("#telemetry-content")).toBeVisible();
  await expect(page.locator(".metric-card")).toHaveCount(4);
  await expect(page.locator("#telemetry-content")).toContainText("ENTITIES");
  await expect(page.locator("#telemetry-content")).toContainText("CRITICAL");
  await expect(page.locator("#telemetry-content")).toContainText("WARNINGS");
  await expect(page.locator("#telemetry-content")).toContainText("UPTIME");
});

test("telemetry panel renders event stream", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await expect(page.locator(".event-stream")).toBeVisible();
  await expect(page.locator(".stream-item").first()).toBeVisible();
});

// ===== FILTER TESTS =====

test("severity filters update visible entities", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#left-rail-tabs .rail-tab[data-tab='operations']").click();
  await page.waitForSelector("#operations-panel:not(.hidden)");

  await expect(page.locator(".entity-card")).toHaveCount(6);

  // Filter by critical severity (input is hidden, so use JS to toggle and dispatch change)
  await page.locator("#filter-severities input[value='critical']").evaluate((el) => {
    const input = el as HTMLInputElement;
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator(".entity-card")).toHaveCount(2);
});

// ===== RESPONSIVE TESTS =====

test("dashboard layout is responsive on smaller viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto(`http://127.0.0.1:${web.port}`);

  await expect(page.locator("#mordor-app")).toBeVisible();
  await expect(page.locator("#left-rail-tabs")).toBeVisible();
  await expect(page.locator("#right-rail-tabs")).toBeVisible();
  await expect(page.locator("#cesiumContainer")).toBeVisible();
});

// ===== ERROR STATE TESTS =====

test("dashboard handles unauthenticated state gracefully", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#left-rail-tabs .rail-tab[data-tab='operations']").click();
  await page.waitForSelector("#operations-panel:not(.hidden)");

  // Demo data should still render even without auth
  await expect(page.locator(".entity-card").first()).toBeVisible({ timeout: 5000 });
});
