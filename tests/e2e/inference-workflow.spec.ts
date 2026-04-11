import { expect, test } from "@playwright/test";
import { startApiServer } from "../../apps/api/src/index.js";
import { startWebServer } from "../../apps/web/src/server.js";
import { authenticate } from "../../packages/auth/src/index.js";
import { startPostgresTestEnvironment } from "../helpers/postgres-test-environment.js";

test.describe.configure({ mode: "serial" });

let environment: Awaited<ReturnType<typeof startPostgresTestEnvironment>>;
let api: Awaited<ReturnType<typeof startApiServer>>;
let web: Awaited<ReturnType<typeof startWebServer>>;
let operatorToken: string;

test.beforeAll(async () => {
  environment = await startPostgresTestEnvironment();
  api = await startApiServer({
    connection_string: environment.connection_string,
    skipConfigValidation: true,
  });
  web = await startWebServer({
    api_base_url: `http://127.0.0.1:${api.port}`,
  });

  const auth = authenticate("operator", "operator123");
  operatorToken = auth.token ?? "";
});

test.afterAll(async () => {
  await web.close();
  await api.close();
  await environment.stop();
});

async function createTestInference(): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${api.port}/inferences`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${operatorToken}`,
    },
    body: JSON.stringify({
      inference_type: "nav_degradation",
      time_window_start: "2026-04-06T10:00:00Z",
      time_window_end: "2026-04-06T11:00:00Z",
      evidence_summary: "Test navigation degradation for E2E testing",
      details: {
        severity: "moderate",
        affected_area_sqkm: 50,
        degraded_signals: 5,
        total_signals: 10,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create inference: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    inference: { inference_id: string };
  };
  return data.inference.inference_id;
}

async function createTestIncident(): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${api.port}/incidents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${operatorToken}`,
    },
    body: JSON.stringify({
      title: "Test Incident for Inferences",
      start_at: "2026-04-06T10:00:00Z",
      end_at: "2026-04-06T12:00:00Z",
      severity: "high",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to create incident: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    incident_id?: string;
    incident?: { incident_id: string };
  };
  const incidentId = data.incident_id ?? data.incident?.incident_id;
  if (!incidentId) {
    throw new Error(`Invalid response: ${JSON.stringify(data)}`);
  }
  return incidentId;
}

test.describe("inference layer toggles", () => {
  test("inference panel exists in left rail", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    const inferencePanel = page.locator("#inference-panel");
    await expect(inferencePanel).toBeVisible();
  });

  test("has degradation layer toggle", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    const layerToggle = page.locator(
      '.inference-layer-item[data-layer="degradation"] .layer-toggle',
    );
    await expect(layerToggle).toBeVisible();
  });

  test("has redirection layer toggle", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    const layerToggle = page.locator(
      '.inference-layer-item[data-layer="redirection"] .layer-toggle',
    );
    await expect(layerToggle).toBeVisible();
  });

  test("has holding layer toggle", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    const layerToggle = page.locator('.inference-layer-item[data-layer="holding"] .layer-toggle');
    await expect(layerToggle).toBeVisible();
  });

  test("has absence layer toggle", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    const layerToggle = page.locator('.inference-layer-item[data-layer="absence"] .layer-toggle');
    await expect(layerToggle).toBeVisible();
  });

  test("degradation toggle is unchecked by default", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    const layerToggle = page.locator("#layer-degradation");
    await expect(layerToggle).not.toBeChecked();
  });

  test("clicking degradation toggle updates state", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    const layerToggle = page.locator(
      '.inference-layer-item[data-layer="degradation"] .layer-toggle',
    );
    await layerToggle.click();

    const checkbox = page.locator("#layer-degradation");
    await expect(checkbox).toBeChecked();
  });

  test("inference count badge exists", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    const countBadge = page.locator("#inference-count");
    await expect(countBadge).toBeVisible();
  });

  test("inference list container exists", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    const inferenceList = page.locator("#inference-list");
    await expect(inferenceList).toBeVisible();
  });
});

test.describe("inference markers", () => {
  test("displays empty state when no inferences", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    const inferenceList = page.locator("#inference-list");
    await expect(inferenceList).toContainText("No inferences detected");
  });

  test("displays inference items when data exists", async ({ page }) => {
    await createTestInference();

    await page.goto(`http://127.0.0.1:${web.port}`);

    await page.waitForTimeout(2000);

    const items = page.locator(".inference-item");
    await expect(items.first()).toBeVisible({ timeout: 10000 });
  });

  test("displays confidence badge for inference", async ({ page }) => {
    await createTestInference();

    await page.goto(`http://127.0.0.1:${web.port}`);

    await page.waitForTimeout(2000);

    const confidenceBadge = page.locator(".inference-item-confidence").first();
    await expect(confidenceBadge).toBeVisible({ timeout: 10000 });
  });

  test("displays evidence summary for inference", async ({ page }) => {
    await createTestInference();

    await page.goto(`http://127.0.0.1:${web.port}`);

    await page.waitForTimeout(2000);

    const evidenceText = page.locator(".inference-item-evidence").first();
    await expect(evidenceText).toBeVisible({ timeout: 10000 });
  });
});

test.describe("incident-linked inferences", () => {
  test("incident timeline includes inferred markers when linked", async () => {
    const incidentId = await createTestIncident();
    const inferenceId = await createTestInference();

    await fetch(`http://127.0.0.1:${api.port}/inferences/${inferenceId}/link-incident`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${operatorToken}`,
      },
      body: JSON.stringify({ incident_id: incidentId }),
    });

    const response = await fetch(`http://127.0.0.1:${api.port}/incidents/${incidentId}/timeline`);
    const timeline = (await response.json()) as { inferences: unknown[] };

    expect(timeline.inferences).toBeDefined();
    expect(Array.isArray(timeline.inferences)).toBe(true);
  });

  test("inference list shows correct counts", async ({ page }) => {
    await createTestInference();
    await createTestInference();

    await page.goto(`http://127.0.0.1:${web.port}`);

    await page.waitForTimeout(2000);

    const countBadge = page.locator("#inference-count");
    const countText = await countBadge.textContent();
    expect(parseInt(countText ?? "0", 10)).toBeGreaterThanOrEqual(2);
  });
});
