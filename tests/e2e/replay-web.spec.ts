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
let authToken: string;

test.beforeAll(async () => {
  environment = await startPostgresTestEnvironment();
  api = await startApiServer({
    connection_string: environment.connection_string,
    skipConfigValidation: true,
  });
  web = await startWebServer({
    api_base_url: `http://127.0.0.1:${api.port}`,
  });
  const authResult = authenticate("operator", "operator123");
  authToken = authResult.token ?? "";
});

test.afterAll(async () => {
  await web.close();
  await api.close();
  await environment.stop();
});

test("loads replay and displays on map with timeline controls", async ({ page, request }) => {
  const ingestPayload = await loadJsonFixture<unknown>(
    "adapters",
    "fixture-telemetry",
    "valid.request.json",
  );
  const ingestResponse = await request.post(
    `http://127.0.0.1:${api.port}/ingest/fixture-telemetry`,
    {
      data: ingestPayload,
      headers: { Authorization: `Bearer ${authToken}` },
    },
  );

  expect(ingestResponse.status()).toBe(200);

  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#load-replay-btn").click();

  await expect(page.locator("#status-message")).toContainText("LOADED");
  await expect(page.locator("#timeline-position")).toContainText("EVT 1/2");
  await expect(page.locator("#replay-timestamp")).toBeVisible();
  await expect(page.locator("#event-list li")).toHaveCount(2);
});

test("step button advances timeline", async ({ page, request }) => {
  const ingestPayload = await loadJsonFixture<unknown>(
    "adapters",
    "fixture-telemetry",
    "valid.request.json",
  );
  await request.post(`http://127.0.0.1:${api.port}/ingest/fixture-telemetry`, {
    data: ingestPayload,
    headers: { Authorization: `Bearer ${authToken}` },
  });

  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#load-replay-btn").click();

  await expect(page.locator("#timeline-position")).toContainText("EVT 1/2");

  await page.waitForTimeout(500);
  await page.locator("#step-replay").click();

  await expect(page.locator("#timeline-position")).toContainText("EVT 2/2");
});

test("play button starts auto-playback", async ({ page, request }) => {
  const ingestPayload = await loadJsonFixture<unknown>(
    "adapters",
    "fixture-telemetry",
    "valid.request.json",
  );
  await request.post(`http://127.0.0.1:${api.port}/ingest/fixture-telemetry`, {
    data: ingestPayload,
    headers: { Authorization: `Bearer ${authToken}` },
  });

  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#load-replay-btn").click();

  await page.waitForTimeout(500);
  await page.locator("#play-replay").click();

  await expect(page.locator("#status-message")).toContainText("PLAYING");
});

test("pause button stops auto-playback", async ({ page, request }) => {
  const ingestPayload = await loadJsonFixture<unknown>(
    "adapters",
    "fixture-telemetry",
    "valid.request.json",
  );
  await request.post(`http://127.0.0.1:${api.port}/ingest/fixture-telemetry`, {
    data: ingestPayload,
    headers: { Authorization: `Bearer ${authToken}` },
  });

  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#load-replay-btn").click();

  await page.waitForTimeout(500);
  await page.locator("#play-replay").click();
  await page.waitForTimeout(300);
  await page.locator("#pause-replay").click();

  await expect(page.locator("#status-message")).toContainText("PAUSED");
});

test("reset button returns to first event", async ({ page, request }) => {
  const ingestPayload = await loadJsonFixture<unknown>(
    "adapters",
    "fixture-telemetry",
    "valid.request.json",
  );
  await request.post(`http://127.0.0.1:${api.port}/ingest/fixture-telemetry`, {
    data: ingestPayload,
    headers: { Authorization: `Bearer ${authToken}` },
  });

  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#load-replay-btn").click();

  await page.waitForTimeout(500);
  await page.locator("#step-replay").click();
  await expect(page.locator("#timeline-position")).toContainText("EVT 2/2");

  await page.locator("#reset-replay").click();

  await expect(page.locator("#timeline-position")).toContainText("EVT 1/2");
});

test("timeline slider scrubs to event", async ({ page, request }) => {
  const ingestPayload = await loadJsonFixture<unknown>(
    "adapters",
    "fixture-telemetry",
    "valid.request.json",
  );
  await request.post(`http://127.0.0.1:${api.port}/ingest/fixture-telemetry`, {
    data: ingestPayload,
    headers: { Authorization: `Bearer ${authToken}` },
  });

  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#load-replay-btn").click();

  await page.waitForTimeout(500);
  await page.locator("#timeline-slider").fill("1");
  await page.locator("#timeline-slider").dispatchEvent("input");

  await expect(page.locator("#timeline-position")).toContainText("EVT 2/2");
});

test("layer toggles control visibility", async ({ page, request }) => {
  const ingestPayload = await loadJsonFixture<unknown>(
    "adapters",
    "fixture-telemetry",
    "valid.request.json",
  );
  await request.post(`http://127.0.0.1:${api.port}/ingest/fixture-telemetry`, {
    data: ingestPayload,
    headers: { Authorization: `Bearer ${authToken}` },
  });

  await page.goto(`http://127.0.0.1:${web.port}`);
  await page.locator("#load-replay-btn").click();

  await page.waitForTimeout(500);
  // In new UI, flights layer is default on
  const flightsCheckbox = page.locator("#layer-flights");
  const flightsToggle = page.locator('[data-layer="flights"] .toggle-slider');
  await flightsToggle.scrollIntoViewIfNeeded();
  await flightsToggle.click();
  await expect(flightsCheckbox).not.toBeChecked();
  await flightsToggle.click();
  await expect(flightsCheckbox).toBeChecked();
});

test("rejects malformed input end to end and quarantines the raw payload", async ({ request }) => {
  const malformedPayload = await loadJsonFixture<unknown>(
    "adapters",
    "fixture-telemetry",
    "malformed.request.json",
  );
  const response = await request.post(`http://127.0.0.1:${api.port}/ingest/fixture-telemetry`, {
    data: malformedPayload,
    headers: { Authorization: `Bearer ${authToken}` },
  });
  const payload = await response.json();
  const quarantineCount = await environment.database.pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM raw_payloads WHERE parse_status = 'quarantined'",
  );

  expect(response.status()).toBe(400);
  expect(payload.status).toBe("rejected");
  expect(payload.quarantined_records).toHaveLength(1);
  expect(quarantineCount.rows[0]?.count).toBe("1");
});
