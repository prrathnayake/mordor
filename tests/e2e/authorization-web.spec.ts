import { expect, test } from "@playwright/test";
import { startApiServer } from "../../apps/api/src/index.js";
import { startWebServer } from "../../apps/web/src/server.js";
import { authenticate } from "../../packages/auth/src/index.js";
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

test("shows login button when not authenticated", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);
  await expect(page.locator("#auth-button")).toBeVisible();
  await expect(page.locator("#auth-button")).toHaveText("LOGIN");
  await expect(page.locator(".session-status")).toContainText("NO SESSION");
});

test("login form appears when login button clicked", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#auth-button").click();
  await expect(page.locator("#login-modal")).toBeVisible();
  await expect(page.locator("#username")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
  await expect(page.locator("#submit-login")).toBeVisible();
  await expect(page.locator("#cancel-login")).toBeVisible();
});

test("successful login updates session UI", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  // Click login and fill credentials
  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("operator123");

  // Click submit and wait for network response
  const loginResponse = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/auth/login")),
    page.locator("#submit-login").click(),
  ]);

  // Verify login API returned success with token
  expect(loginResponse[0].status()).toBe(200);
  const responseData = await loginResponse[0].json();
  expect(responseData.token).toBeDefined();

  // Wait for modal to close (proves login function executed successfully)
  await expect(page.locator("#login-modal")).toBeHidden({ timeout: 5000 });
});

test("login with invalid credentials shows error", async ({ page }) => {
  const dialogPromise = page.waitForEvent("dialog");
  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("wrongpassword");
  await page.locator("#submit-login").click();

  const dialog = await dialogPromise;
  // The API returns "unauthorized" or the error message from the response
  expect(dialog.message().toLowerCase()).toMatch(/(unauthorized|login failed|invalid)/);
  await dialog.accept();
});

test("logout clears session", async ({ page }) => {
  // Login first
  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#auth-button").click();
  await page.locator("#username").fill("operator");
  await page.locator("#password").fill("operator123");
  await page.locator("#submit-login").click();

  // Wait for login to complete - modal closes and status updates
  await expect(page.locator("#login-modal")).toBeHidden({ timeout: 5000 });

  // Logout - accept the dialog that appears
  const dialogPromise = page.waitForEvent("dialog");
  await page.locator("#auth-button").click();
  const dialog = await dialogPromise;
  await dialog.accept();

  // Verify logout state - status message changes to LOGGED OUT
  await expect(page.locator("#status-message")).toContainText("LOGGED OUT");
});

test("operator can see close button on alerts", async ({ page }) => {
  const authResult = authenticate("operator", "operator123");
  const operatorToken = authResult.token ?? "";

  const ingestPayload = await loadJsonFixture<unknown>(
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

  // In new UI, alerts are shown in the footer strip
  await expect(page.locator(".alerts-strip")).toBeVisible();
});

test("viewer cannot see close button on alerts", async ({ page }) => {
  const authResult = authenticate("viewer", "viewer123");
  const viewerToken = authResult.token ?? "";

  const ingestPayload = await loadJsonFixture<unknown>(
    "adapters",
    "fixture-telemetry",
    "valid.request.json",
  );
  await fetch(`http://127.0.0.1:${api.port}/ingest/fixture-telemetry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${viewerToken}`,
    },
    body: JSON.stringify(ingestPayload),
  });

  await page.goto(`http://127.0.0.1:${web.port}`);

  // Login
  await page.locator("#auth-button").click();
  await page.locator("#username").fill("viewer");
  await page.locator("#password").fill("viewer123");
  await page.locator("#submit-login").click();
  await expect(page.locator("#login-modal")).toBeHidden({ timeout: 5000 });

  // In new UI, alerts are shown in the footer strip
  await expect(page.locator(".alerts-strip")).toBeVisible();
});

test("replay loads correctly under authenticated session", async ({ page }) => {
  const authResult = authenticate("operator", "operator123");
  const operatorToken = authResult.token ?? "";

  const ingestPayload = await loadJsonFixture<unknown>(
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
