import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAlertRuleId } from "../../packages/alerts/src/index.js";
import {
  setupAuthenticatedApi,
  teardownAuthenticatedApi,
} from "../helpers/authenticated-test-setup.js";

describe("alert API integration", () => {
  let setup: Awaited<ReturnType<typeof setupAuthenticatedApi>>;

  beforeAll(async () => {
    setup = await setupAuthenticatedApi();
  });

  afterAll(async () => {
    await teardownAuthenticatedApi(setup);
  });

  beforeEach(async () => {
    await setup.environment.database.pool.query("DELETE FROM alerts");
  });

  it("stores alert and fetches via API", async () => {
    const alertId = createAlertRuleId("source_error", "2026-04-05T10:20:00Z");
    await setup.api.persistence.persistAlert({
      alert_id: alertId,
      rule_id: "source_error",
      severity: "critical",
      evidence_event_ids: ["evt_1"],
      evidence_object_ids: ["obj_1"],
      summary: "Test alert",
      explanation: "Test explanation",
      confidence: 0.99,
    });

    const response = await fetch(`http://127.0.0.1:${setup.api.port}/alerts`, {
      headers: { Authorization: `Bearer ${setup.operatorToken}` },
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { alerts: Array<{ alert_id: string }> };
    expect(data.alerts).toHaveLength(1);
    expect(data.alerts[0]?.alert_id).toBe(alertId);
  });

  it("fetches single alert by ID", async () => {
    const alertId = createAlertRuleId("object_stale", "2026-04-05T10:20:00Z");
    await setup.api.persistence.persistAlert({
      alert_id: alertId,
      rule_id: "object_stale",
      severity: "warning",
      evidence_event_ids: ["evt_1"],
      evidence_object_ids: ["obj_1"],
      summary: "Stale object",
      explanation: "Object has not reported",
      confidence: 0.85,
    });

    const response = await fetch(`http://127.0.0.1:${setup.api.port}/alerts/${alertId}`, {
      headers: { Authorization: `Bearer ${setup.operatorToken}` },
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { alert_id: string; severity: string };
    expect(data.alert_id).toBe(alertId);
    expect(data.severity).toBe("warning");
  });

  it("returns 401 without auth token", async () => {
    const response = await fetch(`http://127.0.0.1:${setup.api.port}/alerts`);
    expect(response.status).toBe(401);
  });

  it("returns 404 for non-existent alert", async () => {
    const response = await fetch(`http://127.0.0.1:${setup.api.port}/alerts/nonexistent`, {
      headers: { Authorization: `Bearer ${setup.operatorToken}` },
    });
    expect(response.status).toBe(404);
  });

  it("updates alert status via PATCH", async () => {
    const alertId = createAlertRuleId("source_error", "2026-04-05T10:20:00Z");
    await setup.api.persistence.persistAlert({
      alert_id: alertId,
      rule_id: "source_error",
      severity: "critical",
      evidence_event_ids: ["evt_1"],
      evidence_object_ids: [],
      summary: "Test",
      explanation: "Test",
      confidence: 0.99,
    });

    const response = await fetch(`http://127.0.0.1:${setup.api.port}/alerts/${alertId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({ status: "acknowledged" }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as { status: string };
    expect(data.status).toBe("acknowledged");
  });

  it("filters alerts by status", async () => {
    await setup.api.persistence.persistAlert({
      alert_id: "alert_open",
      rule_id: "source_error",
      severity: "critical",
      evidence_event_ids: ["evt_1"],
      evidence_object_ids: [],
      summary: "Open alert",
      explanation: "Test",
      confidence: 0.99,
    });
    await setup.api.persistence.persistAlert({
      alert_id: "alert_closed",
      rule_id: "source_error",
      severity: "critical",
      evidence_event_ids: ["evt_2"],
      evidence_object_ids: [],
      summary: "Closed alert",
      explanation: "Test",
      confidence: 0.99,
    });

    await setup.api.persistence.updateAlertStatus({
      alert_id: "alert_closed",
      status: "closed",
    });

    const response = await fetch(`http://127.0.0.1:${setup.api.port}/alerts?status=open`, {
      headers: { Authorization: `Bearer ${setup.operatorToken}` },
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { alerts: Array<{ status: string }> };
    expect(data.alerts).toHaveLength(1);
    expect(data.alerts[0]?.status).toBe("open");
  });

  it("filters alerts by severity", async () => {
    await setup.api.persistence.persistAlert({
      alert_id: "alert_critical",
      rule_id: "source_error",
      severity: "critical",
      evidence_event_ids: ["evt_1"],
      evidence_object_ids: [],
      summary: "Critical",
      explanation: "Test",
      confidence: 0.99,
    });
    await setup.api.persistence.persistAlert({
      alert_id: "alert_warning",
      rule_id: "object_stale",
      severity: "warning",
      evidence_event_ids: ["evt_2"],
      evidence_object_ids: [],
      summary: "Warning",
      explanation: "Test",
      confidence: 0.85,
    });

    const response = await fetch(`http://127.0.0.1:${setup.api.port}/alerts?severity=critical`, {
      headers: { Authorization: `Bearer ${setup.operatorToken}` },
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { alerts: Array<{ severity: string }> };
    expect(data.alerts).toHaveLength(1);
    expect(data.alerts[0]?.severity).toBe("critical");
  });

  it("returns empty list when no alerts exist", async () => {
    const response = await fetch(`http://127.0.0.1:${setup.api.port}/alerts`, {
      headers: { Authorization: `Bearer ${setup.operatorToken}` },
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { alerts: Array<{ alert_id: string }> };
    expect(data.alerts).toHaveLength(0);
  });

  it("operator can close alert via PATCH", async () => {
    const alertId = createAlertRuleId("source_error", "2026-04-05T10:20:00Z");
    await setup.api.persistence.persistAlert({
      alert_id: alertId,
      rule_id: "source_error",
      severity: "critical",
      evidence_event_ids: ["evt_1"],
      evidence_object_ids: [],
      summary: "Test",
      explanation: "Test",
      confidence: 0.99,
    });

    const response = await fetch(`http://127.0.0.1:${setup.api.port}/alerts/${alertId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify({ status: "closed" }),
    });
    expect(response.status).toBe(200);
  });

  it("viewer cannot close alert via PATCH", async () => {
    const alertId = createAlertRuleId("source_error", "2026-04-05T10:20:00Z");
    await setup.api.persistence.persistAlert({
      alert_id: alertId,
      rule_id: "source_error",
      severity: "critical",
      evidence_event_ids: ["evt_1"],
      evidence_object_ids: [],
      summary: "Test",
      explanation: "Test",
      confidence: 0.99,
    });

    const response = await fetch(`http://127.0.0.1:${setup.api.port}/alerts/${alertId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.authToken}`,
      },
      body: JSON.stringify({ status: "closed" }),
    });
    expect(response.status).toBe(403);
  });

  it("unauthenticated request to close alert returns 401", async () => {
    const alertId = createAlertRuleId("source_error", "2026-04-05T10:20:00Z");
    await setup.api.persistence.persistAlert({
      alert_id: alertId,
      rule_id: "source_error",
      severity: "critical",
      evidence_event_ids: ["evt_1"],
      evidence_object_ids: [],
      summary: "Test",
      explanation: "Test",
      confidence: 0.99,
    });

    const response = await fetch(`http://127.0.0.1:${setup.api.port}/alerts/${alertId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "closed" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns alert with full evidence details", async () => {
    const alertId = createAlertRuleId("object_stale", "2026-04-05T10:20:00Z");
    await setup.api.persistence.persistAlert({
      alert_id: alertId,
      rule_id: "object_stale",
      severity: "warning",
      evidence_event_ids: ["evt_123", "evt_456"],
      evidence_object_ids: ["obj_abc"],
      summary: "Stale object detected",
      explanation: "Object has not reported position in 5 minutes",
      confidence: 0.85,
    });

    const response = await fetch(`http://127.0.0.1:${setup.api.port}/alerts/${alertId}`, {
      headers: { Authorization: `Bearer ${setup.operatorToken}` },
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      alert_id: string;
      evidence_event_ids: string[];
      evidence_object_ids: string[];
      rule_id: string;
    };
    expect(data.alert_id).toBe(alertId);
    expect(data.rule_id).toBe("object_stale");
    expect(data.evidence_event_ids).toHaveLength(2);
    expect(data.evidence_object_ids).toContain("obj_abc");
  });
});

describe("auth validate endpoint", () => {
  let setup: Awaited<ReturnType<typeof setupAuthenticatedApi>>;

  beforeAll(async () => {
    setup = await setupAuthenticatedApi();
  });

  afterAll(async () => {
    await teardownAuthenticatedApi(setup);
  });

  it("returns user for valid token", async () => {
    const response = await fetch(`http://127.0.0.1:${setup.api.port}/auth/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: setup.operatorToken }),
    });
    expect(response.status).toBe(200);
    const data = (await response.json()) as { user: { username: string; role: string } };
    expect(data.user.username).toBe("operator");
    expect(data.user.role).toBe("operator");
  });

  it("returns 401 for invalid token", async () => {
    const response = await fetch(`http://127.0.0.1:${setup.api.port}/auth/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "invalid_token" }),
    });
    expect(response.status).toBe(401);
  });
});
