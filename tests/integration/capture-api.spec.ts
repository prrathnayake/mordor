import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  setupAuthenticatedApi,
  teardownAuthenticatedApi,
} from "../helpers/authenticated-test-setup.js";

describe("capture job API integration", () => {
  let setup: Awaited<ReturnType<typeof setupAuthenticatedApi>>;

  beforeAll(async () => {
    setup = await setupAuthenticatedApi();
  });

  afterAll(async () => {
    await teardownAuthenticatedApi(setup);
  });

  it("creates a capture job for an incident", async () => {
    const incidentResponse = await fetch(`http://127.0.0.1:${setup.api.port}/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({
        title: "Test Incident for Capture",
        description: "Testing capture job creation",
        start_at: "2026-04-06T10:00:00Z",
        end_at: "2026-04-06T12:00:00Z",
        severity: "high",
      }),
    });

    expect(incidentResponse.status).toBe(201);
    const incidentData = (await incidentResponse.json()) as {
      incident_id?: string;
      incident?: { incident_id: string };
    };
    const incidentId = incidentData.incident_id ?? incidentData.incident?.incident_id;
    expect(incidentId).toBeDefined();

    const response = await fetch(
      `http://127.0.0.1:${setup.api.port}/incidents/${incidentId}/capture-jobs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setup.operatorToken}`,
        },
        body: JSON.stringify({
          source_type: "flights",
        }),
      },
    );

    expect(response.status).toBe(201);
    const data = (await response.json()) as {
      capture_job: {
        capture_job_id: string;
        incident_id: string;
        source_type: string;
        status: string;
      };
    };

    expect(data.capture_job.incident_id).toBe(incidentId);
    expect(data.capture_job.source_type).toBe("flights");
    expect(data.capture_job.status).toBe("pending");
    expect(data.capture_job.capture_job_id).toBeDefined();
  });

  it("lists capture jobs for an incident", async () => {
    const incidentResponse = await fetch(`http://127.0.0.1:${setup.api.port}/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({
        title: "List Capture Jobs Test",
        start_at: "2026-04-06T10:00:00Z",
        end_at: "2026-04-06T12:00:00Z",
        severity: "medium",
      }),
    });

    const incidentData = (await incidentResponse.json()) as {
      incident_id?: string;
      incident?: { incident_id: string };
    };
    const incidentId = incidentData.incident_id ?? incidentData.incident?.incident_id;

    await fetch(`http://127.0.0.1:${setup.api.port}/incidents/${incidentId}/capture-jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({ source_type: "earthquakes" }),
    });

    await fetch(`http://127.0.0.1:${setup.api.port}/incidents/${incidentId}/capture-jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({ source_type: "alerts" }),
    });

    const response = await fetch(
      `http://127.0.0.1:${setup.api.port}/incidents/${incidentId}/capture-jobs`,
      {
        headers: { Authorization: `Bearer ${setup.operatorToken}` },
      },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      capture_jobs: Array<{ capture_job_id: string; source_type: string }>;
    };

    expect(data.capture_jobs.length).toBeGreaterThanOrEqual(2);
  });

  it("starts a capture job", async () => {
    const incidentResponse = await fetch(`http://127.0.0.1:${setup.api.port}/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({
        title: "Start Capture Job Test",
        start_at: "2026-04-06T10:00:00Z",
        end_at: "2026-04-06T12:00:00Z",
        severity: "low",
      }),
    });

    const incidentData = (await incidentResponse.json()) as {
      incident_id?: string;
      incident?: { incident_id: string };
    };
    const incidentId = incidentData.incident_id ?? incidentData.incident?.incident_id;

    const createResponse = await fetch(
      `http://127.0.0.1:${setup.api.port}/incidents/${incidentId}/capture-jobs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setup.operatorToken}`,
        },
        body: JSON.stringify({ source_type: "events" }),
      },
    );

    const createData = (await createResponse.json()) as {
      capture_job: { capture_job_id: string };
    };
    const captureJobId = createData.capture_job.capture_job_id;

    const startResponse = await fetch(
      `http://127.0.0.1:${setup.api.port}/capture-jobs/${captureJobId}/start`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${setup.operatorToken}` },
      },
    );

    expect(startResponse.status).toBe(200);
    const startData = (await startResponse.json()) as {
      capture_job: { status: string; started_at: string | null };
    };

    expect(startData.capture_job.status).toBe("running");
    expect(startData.capture_job.started_at).not.toBeNull();
  });

  it("runs a capture job end-to-end", async () => {
    const incidentResponse = await fetch(`http://127.0.0.1:${setup.api.port}/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({
        title: "Run Capture Job Test",
        start_at: "2026-04-06T10:00:00Z",
        end_at: "2026-04-06T12:00:00Z",
        severity: "medium",
      }),
    });

    const incidentData = (await incidentResponse.json()) as {
      incident_id?: string;
      incident?: { incident_id: string };
    };
    const incidentId = incidentData.incident_id ?? incidentData.incident?.incident_id;

    const createResponse = await fetch(
      `http://127.0.0.1:${setup.api.port}/incidents/${incidentId}/capture-jobs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setup.operatorToken}`,
        },
        body: JSON.stringify({ source_type: "alerts" }),
      },
    );

    const createData = (await createResponse.json()) as {
      capture_job: { capture_job_id: string };
    };
    const captureJobId = createData.capture_job.capture_job_id;

    const runResponse = await fetch(
      `http://127.0.0.1:${setup.api.port}/capture-jobs/${captureJobId}/run`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${setup.operatorToken}` },
      },
    );

    expect(runResponse.status).toBe(200);
    const runData = (await runResponse.json()) as {
      capture_job: { status: string; snapshot_count: number };
      capture_result: { success: boolean };
    };

    expect(runData.capture_job.status).toBe("completed");
    expect(runData.capture_result.success).toBe(true);
  });

  it("gets capture job detail", async () => {
    const incidentResponse = await fetch(`http://127.0.0.1:${setup.api.port}/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({
        title: "Get Capture Detail Test",
        start_at: "2026-04-06T10:00:00Z",
        end_at: "2026-04-06T12:00:00Z",
        severity: "high",
      }),
    });

    const incidentData = (await incidentResponse.json()) as {
      incident_id?: string;
      incident?: { incident_id: string };
    };
    const incidentId = incidentData.incident_id ?? incidentData.incident?.incident_id;

    const createResponse = await fetch(
      `http://127.0.0.1:${setup.api.port}/incidents/${incidentId}/capture-jobs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setup.operatorToken}`,
        },
        body: JSON.stringify({ source_type: "flights" }),
      },
    );

    const createData = (await createResponse.json()) as {
      capture_job: { capture_job_id: string };
    };
    const captureJobId = createData.capture_job.capture_job_id;

    const detailResponse = await fetch(
      `http://127.0.0.1:${setup.api.port}/capture-jobs/${captureJobId}`,
      {
        headers: { Authorization: `Bearer ${setup.operatorToken}` },
      },
    );

    expect(detailResponse.status).toBe(200);
    const detailData = (await detailResponse.json()) as {
      capture_job: { capture_job_id: string; snapshots: Array<unknown> };
      evidence_freeze: unknown;
    };

    expect(detailData.capture_job.capture_job_id).toBe(captureJobId);
    expect(Array.isArray(detailData.capture_job.snapshots)).toBe(true);
  });

  it("freezes evidence for completed capture job", async () => {
    const incidentResponse = await fetch(`http://127.0.0.1:${setup.api.port}/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({
        title: "Freeze Evidence Test",
        start_at: "2026-04-06T10:00:00Z",
        end_at: "2026-04-06T12:00:00Z",
        severity: "critical",
      }),
    });

    const incidentData = (await incidentResponse.json()) as {
      incident_id?: string;
      incident?: { incident_id: string };
    };
    const incidentId = incidentData.incident_id ?? incidentData.incident?.incident_id;

    const createResponse = await fetch(
      `http://127.0.0.1:${setup.api.port}/incidents/${incidentId}/capture-jobs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setup.operatorToken}`,
        },
        body: JSON.stringify({ source_type: "events" }),
      },
    );

    const createData = (await createResponse.json()) as {
      capture_job: { capture_job_id: string };
    };
    const captureJobId = createData.capture_job.capture_job_id;

    await fetch(`http://127.0.0.1:${setup.api.port}/capture-jobs/${captureJobId}/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${setup.operatorToken}` },
    });

    const freezeResponse = await fetch(
      `http://127.0.0.1:${setup.api.port}/capture-jobs/${captureJobId}/freeze`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setup.operatorToken}`,
        },
        body: JSON.stringify({ notes: "Test freeze" }),
      },
    );

    expect(freezeResponse.status).toBe(200);
    const freezeData = (await freezeResponse.json()) as {
      freeze_id: string;
      capture_job: { freeze_status: string };
      evidence_freeze: { freeze_status: string };
    };

    expect(freezeData.freeze_id).toBeDefined();
    expect(freezeData.capture_job.freeze_status).toBe("frozen");
    expect(freezeData.evidence_freeze.freeze_status).toBe("frozen");
  });

  it("gets evidence list for incident", async () => {
    const incidentResponse = await fetch(`http://127.0.0.1:${setup.api.port}/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({
        title: "Evidence List Test",
        start_at: "2026-04-06T10:00:00Z",
        end_at: "2026-04-06T12:00:00Z",
        severity: "medium",
      }),
    });

    const incidentData = (await incidentResponse.json()) as {
      incident_id?: string;
      incident?: { incident_id: string };
    };
    const incidentId = incidentData.incident_id ?? incidentData.incident?.incident_id;

    const response = await fetch(
      `http://127.0.0.1:${setup.api.port}/incidents/${incidentId}/evidence`,
      {
        headers: { Authorization: `Bearer ${setup.operatorToken}` },
      },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      evidence: Array<unknown>;
      capture_status: {
        incident_id: string;
        total_jobs: number;
        has_frozen_evidence: boolean;
      };
    };

    expect(Array.isArray(data.evidence)).toBe(true);
    expect(data.capture_status.incident_id).toBe(incidentId);
    expect(Number(data.capture_status.total_jobs)).toBe(0);
    expect(typeof data.capture_status.has_frozen_evidence).toBe("boolean");
  });

  it("returns 401 without auth token", async () => {
    const incidentResponse = await fetch(`http://127.0.0.1:${setup.api.port}/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({
        title: "Auth Test",
        start_at: "2026-04-06T10:00:00Z",
        end_at: "2026-04-06T12:00:00Z",
        severity: "low",
      }),
    });

    const incidentData = (await incidentResponse.json()) as {
      incident_id?: string;
      incident?: { incident_id: string };
    };
    const incidentId = incidentData.incident_id ?? incidentData.incident?.incident_id;

    const response = await fetch(
      `http://127.0.0.1:${setup.api.port}/incidents/${incidentId}/capture-jobs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_type: "flights" }),
      },
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid source type", async () => {
    const incidentResponse = await fetch(`http://127.0.0.1:${setup.api.port}/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({
        title: "Invalid Source Type Test",
        start_at: "2026-04-06T10:00:00Z",
        end_at: "2026-04-06T12:00:00Z",
        severity: "low",
      }),
    });

    const incidentData = (await incidentResponse.json()) as {
      incident_id?: string;
      incident?: { incident_id: string };
    };
    const incidentId = incidentData.incident_id ?? incidentData.incident?.incident_id;

    const response = await fetch(
      `http://127.0.0.1:${setup.api.port}/incidents/${incidentId}/capture-jobs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${setup.operatorToken}`,
        },
        body: JSON.stringify({ source_type: "invalid_source" }),
      },
    );

    expect(response.status).toBe(400);
  });
});
