import { expect, test } from "@playwright/test";
import { startApiServer } from "../../apps/api/src/index.js";
import { startWebServer } from "../../apps/web/src/server.js";
import { createAlertRuleId } from "../../packages/alerts/src/index.js";
import { authenticate } from "../../packages/auth/src/index.js";
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

test.beforeEach(async () => {
  await environment.database.pool.query("DELETE FROM alerts");
});

test.afterAll(async () => {
  await web.close();
  await api.close();
  await environment.stop();
});

test("alert detail panel shows evidence", async ({ page }) => {
  const authResult = authenticate("operator", "operator123");
  const _operatorToken = authResult.token ?? "";

  const alertId = createAlertRuleId("source_error", "2026-04-05T10:20:00Z");
  await api.persistence.persistAlert({
    alert_id: alertId,
    rule_id: "source_error",
    severity: "critical",
    evidence_event_ids: ["evt_123", "evt_456"],
    evidence_object_ids: ["veh_42"],
    summary: "Test alert",
    explanation: "Test explanation",
    confidence: 0.99,
  });

  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("operator123");
  await page.locator("#submit-login").click();

  await page.waitForTimeout(1000);

  // In new UI, click alert chip in footer
  await page.locator(".alert-chip").first().click();

  await expect(page.locator("#alert-modal")).toBeVisible();
  await expect(page.locator("#alert-detail-content")).toContainText("Rule");
  await expect(page.locator("#alert-detail-content")).toContainText("Triggering Events");
  await expect(page.locator("#alert-detail-content")).toContainText("Related Objects");
});

test("jump to replay button loads relevant time window", async ({ page }) => {
  const alertId = createAlertRuleId("object_stale", "2026-04-05T10:20:00Z");
  await api.persistence.persistAlert({
    alert_id: alertId,
    rule_id: "object_stale",
    severity: "warning",
    evidence_event_ids: ["evt_123"],
    evidence_object_ids: ["veh_42"],
    summary: "Stale object",
    explanation: "Object has not reported",
    confidence: 0.85,
  });

  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("operator123");
  await page.locator("#submit-login").click();

  await page.waitForTimeout(1000);

  // Click alert chip in footer
  await page.locator(".alert-chip").first().click();

  await expect(page.locator("#alert-actions")).toContainText("JUMP TO REPLAY");

  await page.locator("#jump-replay").click();

  // Query modal should open with pre-filled values
  await expect(page.locator("#query-modal")).toBeVisible();
  await expect(page.locator("#start-at")).not.toBeEmpty();
  await expect(page.locator("#end-at")).not.toBeEmpty();
  await expect(page.locator("#object-id")).toHaveValue("veh_42");
});

test("back button returns to alert list", async ({ page }) => {
  const alertId = createAlertRuleId("source_error", "2026-04-05T10:20:00Z");
  await api.persistence.persistAlert({
    alert_id: alertId,
    rule_id: "source_error",
    severity: "critical",
    evidence_event_ids: ["evt_1"],
    evidence_object_ids: ["obj_1"],
    summary: "Test",
    explanation: "Test",
    confidence: 0.99,
  });

  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("operator123");
  await page.locator("#submit-login").click();

  await page.waitForTimeout(500);

  // Click alert chip in footer
  await page.locator(".alert-chip").first().click();
  await expect(page.locator("#alert-modal")).toBeVisible();

  await page.locator("#back-alerts").click();

  await expect(page.locator("#alert-modal")).toBeHidden();
});

test("close alert button works from detail panel", async ({ page }) => {
  const alertId = createAlertRuleId("source_error", "2026-04-05T10:20:00Z");
  await api.persistence.persistAlert({
    alert_id: alertId,
    rule_id: "source_error",
    severity: "critical",
    evidence_event_ids: ["evt_1"],
    evidence_object_ids: [],
    summary: "Test alert",
    explanation: "Test explanation",
    confidence: 0.99,
  });

  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("operator123");
  await page.locator("#submit-login").click();

  await page.waitForTimeout(2000);

  // Click alert chip in footer
  await page.locator(".alert-chip").first().click();
  await expect(page.locator("#alert-modal")).toBeVisible();

  page.on("dialog", (dialog) => dialog.accept());
  await page.locator("#close-alert-btn").click();

  await page.waitForResponse(
    (response) => response.url().includes("/alerts/") && response.request().method() === "PATCH",
  );

  await expect(page.locator("#alert-modal")).toBeHidden();
});

test("investigation flow works under authenticated session", async ({ page }) => {
  const alertId = createAlertRuleId("object_stale", "2026-04-05T10:20:00Z");
  await api.persistence.persistAlert({
    alert_id: alertId,
    rule_id: "object_stale",
    severity: "warning",
    evidence_event_ids: ["evt_123"],
    evidence_object_ids: ["veh_42"],
    summary: "Stale object",
    explanation: "Object has not reported",
    confidence: 0.85,
  });

  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("operator123");
  await page.locator("#submit-login").click();

  await page.waitForTimeout(500);

  // Click alert chip in footer
  await page.locator(".alert-chip").first().click();
  await expect(page.locator("#alert-modal")).toBeVisible();

  await page.locator("#jump-replay").click();
  await page.waitForTimeout(500);

  // Query modal should be visible, click load
  await page.locator("#load-replay").click();
  await expect(page.locator("#status-message")).toContainText("LOADED");
});

test("live mode still works after alert investigation", async ({ page }) => {
  const alertId = createAlertRuleId("source_error", "2026-04-05T10:20:00Z");
  await api.persistence.persistAlert({
    alert_id: alertId,
    rule_id: "source_error",
    severity: "critical",
    evidence_event_ids: ["evt_1"],
    evidence_object_ids: ["obj_1"],
    summary: "Test",
    explanation: "Test",
    confidence: 0.99,
  });

  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("operator123");
  await page.locator("#submit-login").click();

  await page.waitForTimeout(500);

  // Click alert chip in footer
  await page.locator(".alert-chip").first().click();
  await expect(page.locator("#alert-modal")).toBeVisible();

  await page.locator("#back-alerts").click();
  await page.locator("#mode-live").click();
  await expect(page.locator("#mode-live")).toHaveClass(/active/);

  await page.waitForTimeout(1000);
  await expect(page.locator("#connection-text")).toContainText("CONNECTED");
});
