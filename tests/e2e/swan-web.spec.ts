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

test.beforeEach(async () => {
  await environment.database.pool.query(`
    TRUNCATE
      swan_artifacts,
      swan_findings,
      swan_threads,
      swan_activity_events,
      swan_sessions,
      alerts
    RESTART IDENTITY CASCADE
  `);
});

test("enabling Swan enriches alert detail without leaving replay mode", async ({ page }) => {
  await api.persistence.persistAlert({
    alert_id: "alert_swan_ui",
    rule_id: "source_error",
    severity: "critical",
    evidence_event_ids: ["evt_123"],
    evidence_object_ids: ["veh_42"],
    summary: "UI Swan alert",
    explanation: "Alert used to verify Swan UI enrichment.",
    confidence: 0.99,
  });

  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("operator123");
  await page.locator("#submit-login").click();

  await expect(page.locator("#login-modal")).toBeHidden({ timeout: 5000 });
  await expect(page.locator("#swan-toggle")).toBeEnabled();

  await page.locator("#swan-toggle").click();
  await expect(page.locator("#swan-toggle")).toHaveText("SWAN ON", { timeout: 5000 });
  await expect(page.locator("#mode-value")).toHaveText("REPLAY");

  await expect(page.locator(".alert-chip")).toHaveCount(1, { timeout: 5000 });
  await page.locator(".alert-chip").first().click();

  await expect(page.locator("#alert-modal")).toBeVisible();
  await expect(page.locator("#alert-detail-content")).toContainText("SWAN INSIGHTS", {
    timeout: 10000,
  });
  await expect(page.locator("#alert-detail-content")).toContainText("trusted source", {
    timeout: 10000,
  });
});
