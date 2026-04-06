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

async function createTestIncident(): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${api.port}/incidents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${operatorToken}`,
    },
    body: JSON.stringify({
      title: "Test Incident for Capture",
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

test.describe("capture job UI structure", () => {
  test("capture section exists in incident panel", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));

    const captureSection = page.locator("#incident-capture-section");
    await expect(captureSection).toBeVisible();
  });

  test("capture section has add button", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));

    const addButton = page.locator("#btn-add-capture");
    await expect(addButton).toBeVisible();
  });

  test("capture job list container exists", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));

    const captureJobList = page.locator("#capture-job-list");
    await expect(captureJobList).toBeAttached();
  });

  test("evidence list container exists", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));

    const evidenceList = page.locator("#evidence-list");
    await expect(evidenceList).toBeAttached();
  });
});

test.describe("capture job creation", () => {
  test("opens capture source modal when add button clicked", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));
    await page.locator("#btn-add-capture").click();

    const modal = page.locator("#capture-source-modal");
    await expect(modal).toBeVisible();
  });

  test("capture source modal shows all source options", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));
    await page.locator("#btn-add-capture").click();

    await expect(page.locator(".capture-source-btn")).toHaveCount(7);
  });

  test("closes capture modal when close button clicked", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));
    await page.locator("#btn-add-capture").click();

    await page.locator("#close-capture-modal").click();

    const modal = page.locator("#capture-source-modal");
    await expect(modal).not.toBeVisible();
  });
});

test.describe("capture API integration", () => {
  test("creates capture job via API", async () => {
    const incidentId = await createTestIncident();

    const response = await fetch(
      `http://127.0.0.1:${api.port}/incidents/${incidentId}/capture-jobs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${operatorToken}`,
        },
        body: JSON.stringify({ source_type: "flights" }),
      },
    );

    expect(response.status).toBe(201);
    const data = (await response.json()) as {
      capture_job: { capture_job_id: string; status: string };
    };

    expect(data.capture_job.status).toBe("pending");
  });

  test("lists capture jobs for incident", async () => {
    const incidentId = await createTestIncident();

    await fetch(`http://127.0.0.1:${api.port}/incidents/${incidentId}/capture-jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${operatorToken}`,
      },
      body: JSON.stringify({ source_type: "earthquakes" }),
    });

    await fetch(`http://127.0.0.1:${api.port}/incidents/${incidentId}/capture-jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${operatorToken}`,
      },
      body: JSON.stringify({ source_type: "alerts" }),
    });

    const response = await fetch(
      `http://127.0.0.1:${api.port}/incidents/${incidentId}/capture-jobs`,
      {
        headers: { Authorization: `Bearer ${operatorToken}` },
      },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as { capture_jobs: Array<unknown> };

    expect(data.capture_jobs.length).toBe(2);
  });

  test("runs capture job", async () => {
    const incidentId = await createTestIncident();

    const createResponse = await fetch(
      `http://127.0.0.1:${api.port}/incidents/${incidentId}/capture-jobs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${operatorToken}`,
        },
        body: JSON.stringify({ source_type: "alerts" }),
      },
    );

    const createData = (await createResponse.json()) as {
      capture_job: { capture_job_id: string };
    };

    const runResponse = await fetch(
      `http://127.0.0.1:${api.port}/capture-jobs/${createData.capture_job.capture_job_id}/run`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${operatorToken}` },
      },
    );

    expect(runResponse.status).toBe(200);
    const runData = (await runResponse.json()) as {
      capture_job: { status: string };
      capture_result: { success: boolean };
    };

    expect(runData.capture_job.status).toBe("completed");
    expect(runData.capture_result.success).toBe(true);
  });

  test("freezes evidence", async () => {
    const incidentId = await createTestIncident();

    const createResponse = await fetch(
      `http://127.0.0.1:${api.port}/incidents/${incidentId}/capture-jobs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${operatorToken}`,
        },
        body: JSON.stringify({ source_type: "events" }),
      },
    );

    const createData = (await createResponse.json()) as {
      capture_job: { capture_job_id: string };
    };

    await fetch(
      `http://127.0.0.1:${api.port}/capture-jobs/${createData.capture_job.capture_job_id}/run`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${operatorToken}` },
      },
    );

    const freezeResponse = await fetch(
      `http://127.0.0.1:${api.port}/capture-jobs/${createData.capture_job.capture_job_id}/freeze`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${operatorToken}`,
        },
        body: JSON.stringify({}),
      },
    );

    expect(freezeResponse.status).toBe(200);
    const freezeData = (await freezeResponse.json()) as {
      capture_job: { freeze_status: string };
    };

    expect(freezeData.capture_job.freeze_status).toBe("frozen");
  });

  test("gets capture status for incident", async () => {
    const incidentId = await createTestIncident();

    const response = await fetch(
      `http://127.0.0.1:${api.port}/incidents/${incidentId}/capture-status`,
      {
        headers: { Authorization: `Bearer ${operatorToken}` },
      },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      incident_id: string;
      total_jobs: number;
      has_frozen_evidence: boolean;
    };

    expect(data.incident_id).toBe(incidentId);
    expect(Number(data.total_jobs)).toBe(0);
    expect(data.has_frozen_evidence).toBe(false);
  });

  test("gets evidence list for incident", async () => {
    const incidentId = await createTestIncident();

    const response = await fetch(`http://127.0.0.1:${api.port}/incidents/${incidentId}/evidence`, {
      headers: { Authorization: `Bearer ${operatorToken}` },
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      evidence: Array<unknown>;
      capture_status: unknown;
    };

    expect(Array.isArray(data.evidence)).toBe(true);
  });
});

test.describe("regression tests", () => {
  test("regression: live mode still works", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    const liveButton = page.locator("#mode-live");
    await expect(liveButton).toBeVisible();
  });

  test("regression: replay mode still works", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    const replayButton = page.locator("#mode-replay");
    await expect(replayButton).toBeVisible();
  });

  test("regression: alerts strip still visible", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    await expect(page.locator(".alerts-strip")).toBeVisible();
  });

  test("regression: incident panel still works", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    await page.locator("#incident-panel").evaluate((el: Element) => el.classList.remove("hidden"));
    await expect(page.locator(".incident-title")).toBeVisible();
  });

  test("regression: layer toggles still work", async ({ page }) => {
    await page.goto(`http://127.0.0.1:${web.port}`);

    const flightsToggle = page.locator("#layer-flights");
    await expect(flightsToggle).toBeChecked();

    await page.locator(".layer-item[data-layer='flights'] .layer-toggle").click();
    await expect(flightsToggle).not.toBeChecked();

    await page.locator(".layer-item[data-layer='flights'] .layer-toggle").click();
    await expect(flightsToggle).toBeChecked();
  });
});
