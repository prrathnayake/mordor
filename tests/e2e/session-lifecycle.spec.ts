import { expect, test } from "@playwright/test";
import { startApiServer } from "../../apps/api/src/index.js";
import { startWebServer } from "../../apps/web/src/server.js";
import { createAlertRuleId } from "../../packages/alerts/src/index.js";
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

test("login persists session across page reload", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Login
  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("operator123");
  await page.locator("#submit-login").click();

  // Wait for login to complete
  await expect(page.locator("#login-modal")).toBeHidden({ timeout: 5000 });

  // Verify logged in
  await expect(page.locator("#auth-button")).toHaveText("LOGOUT");

  // Reload page
  await page.reload();

  // Verify session persisted
  await expect(page.locator("#auth-button")).toHaveText("LOGOUT");
});

test("invalid stored token is cleared on page load", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.evaluate(() => localStorage.setItem("auth_token", "invalid_fake_token"));

  await page.reload();

  // Should show not logged in state
  await expect(page.locator(".session-status")).toContainText("NO SESSION");
});

test("logout clears session completely", async ({ page }) => {
  // Login first
  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("operator123");
  await page.locator("#submit-login").click();

  await expect(page.locator("#login-modal")).toBeHidden({ timeout: 5000 });
  await expect(page.locator("#auth-button")).toHaveText("LOGOUT");

  // Logout - accept the dialog
  const dialogPromise = page.waitForEvent("dialog");
  await page.locator("#auth-button").click();
  const dialog = await dialogPromise;
  await dialog.accept();

  // Verify logged out
  await expect(page.locator(".session-status")).toContainText("NO SESSION");
  await expect(page.locator("#auth-button")).toHaveText("LOGIN");
});

test("replay works after session is re-established", async ({ page }) => {
  const { authenticate } = await import("../../packages/auth/src/index.js");
  const authResult = authenticate("operator", "operator123");
  const operatorToken = authResult.token ?? "";

  const { loadJsonFixture } = await import("../../packages/test-fixtures/src/index.js");
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

  // Login
  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("operator123");
  await page.locator("#submit-login").click();

  await expect(page.locator("#login-modal")).toBeHidden({ timeout: 5000 });

  // Load replay
  await page.locator("#load-replay-btn").click();
  await expect(page.locator("#status-message")).toContainText("LOADED", { timeout: 10000 });
});

test("operator can acknowledge alert via UI", async ({ page }) => {
  const { authenticate } = await import("../../packages/auth/src/index.js");
  const authResult = authenticate("operator", "operator123");
  const _operatorToken = authResult.token ?? "";

  const alertId = createAlertRuleId("source_error", "2026-04-05T10:20:00Z");
  await api.persistence.persistAlert({
    alert_id: alertId,
    rule_id: "source_error",
    severity: "critical",
    evidence_event_ids: ["evt_123"],
    evidence_object_ids: ["veh_42"],
    summary: "Test alert for acknowledge",
    explanation: "Test explanation",
    confidence: 0.99,
  });

  await page.goto(`http://127.0.0.1:${web.port}`);

  // Login
  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("operator123");
  await page.locator("#submit-login").click();

  await expect(page.locator("#login-modal")).toBeHidden({ timeout: 5000 });

  // Click alert chip to open detail
  await page.locator(".alert-chip").first().click();
  await expect(page.locator("#alert-modal")).toBeVisible();

  // Click acknowledge button
  await page.locator("button:has-text('ACKNOWLEDGE')").click();

  // Wait for update
  await page.waitForTimeout(500);
  await expect(page.locator(".alert-status.acknowledged")).toBeVisible();
});

test("multi-object replay from alert evidence", async ({ page }) => {
  const { authenticate } = await import("../../packages/auth/src/index.js");
  const authResult = authenticate("operator", "operator123");
  const _operatorToken = authResult.token ?? "";

  const alertId = createAlertRuleId("source_error", "2026-04-05T10:25:00Z");
  await api.persistence.persistAlert({
    alert_id: alertId,
    rule_id: "source_error",
    severity: "critical",
    evidence_event_ids: ["evt_123", "evt_456"],
    evidence_object_ids: ["veh_42", "veh_43"],
    summary: "Multi-object test alert",
    explanation: "Test explanation",
    confidence: 0.99,
  });

  await page.goto(`http://127.0.0.1:${web.port}`);

  // Login
  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("operator123");
  await page.locator("#submit-login").click();

  await expect(page.locator("#login-modal")).toBeHidden({ timeout: 5000 });

  // Click alert chip to open detail
  await page.locator(".alert-chip").first().click();
  await expect(page.locator("#alert-modal")).toBeVisible();

  // Click jump to replay
  await page.locator("#jump-replay").click();

  // Query modal should open with object ID filled
  await expect(page.locator("#query-modal")).toBeVisible();
  await expect(page.locator("#object-id")).toHaveValue("veh_42");
});
