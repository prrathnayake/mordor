import { randomUUID } from "node:crypto";
import { SOURCE_SCHEMA_VERSION } from "../../packages/contracts/src/index.js";
import { loadJsonFixture } from "../../packages/test-fixtures/src/index.js";
import {
  setupAuthenticatedApi,
  teardownAuthenticatedApi,
} from "../helpers/authenticated-test-setup.js";

describe("swan API integration", () => {
  let setup: Awaited<ReturnType<typeof setupAuthenticatedApi>> | null = null;

  beforeEach(async () => {
    setup = await setupAuthenticatedApi();
  });

  afterEach(async () => {
    if (setup) {
      await teardownAuthenticatedApi(setup);
      setup = null;
    }
  });

  it("enables Swan sessions and serves baseline artifacts", async () => {
    const clientSessionId = randomUUID();

    const enableResponse = await fetch(`http://127.0.0.1:${setup!.api.port}/swan/session`, {
      method: "POST",
      headers: swanHeaders(setup!.operatorToken, clientSessionId),
      body: JSON.stringify({
        client_session_id: clientSessionId,
        route: "/ops",
        mode: "replay",
        context: {
          active_layers: ["flights", "weather"],
        },
      }),
    });

    expect(enableResponse.status).toBe(201);
    const enabled = (await enableResponse.json()) as {
      session: { session_id: string; client_session_id: string; status: string };
      projections: {
        session: { projection: string; data: { thread_counts: Record<string, number> } };
      };
    };

    expect(enabled.session.client_session_id).toBe(clientSessionId);
    expect(enabled.session.status).toBe("active");
    expect(enabled.projections.session.projection).toBe("session");
    expect(enabled.projections.session.data.thread_counts).toEqual({});

    const sessionResponse = await fetch(`http://127.0.0.1:${setup!.api.port}/swan/session`, {
      headers: swanHeaders(setup!.operatorToken, clientSessionId, {
        "Content-Type": undefined,
      }),
    });
    expect(sessionResponse.status).toBe(200);

    const artifactResponse = await fetch(
      `http://127.0.0.1:${setup!.api.port}/swan/artifacts/${enabled.session.session_id}/session`,
      {
        headers: swanHeaders(setup!.operatorToken, clientSessionId, {
          "Content-Type": undefined,
        }),
      },
    );

    expect(artifactResponse.status).toBe(200);
    const artifact = (await artifactResponse.json()) as {
      projection: string;
      data: { session: { session_id: string } };
    };
    expect(artifact.projection).toBe("session");
    expect(artifact.data.session.session_id).toBe(enabled.session.session_id);
  });

  it("dedupes duplicate object activity and projects object findings", async () => {
    await seedFixtureObject(setup!);
    const { session } = await enableSwanSession(setup!, randomUUID());

    const activityBody = {
      activity_type: "object_selected",
      target_type: "object",
      target_id: "veh_42",
      route: "/ops",
      mode: "replay",
      context: {
        selected_object_id: "veh_42",
      },
    };

    const firstResponse = await fetch(`http://127.0.0.1:${setup!.api.port}/swan/activity`, {
      method: "POST",
      headers: swanHeaders(setup!.operatorToken, session.client_session_id),
      body: JSON.stringify(activityBody),
    });
    expect(firstResponse.status).toBe(202);
    const firstPayload = (await firstResponse.json()) as {
      activity: { activity_type: string } | null;
      scheduled_threads: Array<{ recipe: string }>;
    };
    expect(firstPayload.activity?.activity_type).toBe("object_selected");
    expect(firstPayload.scheduled_threads.map((thread) => thread.recipe)).toEqual([
      "context",
      "verify",
      "research",
    ]);

    const duplicateResponse = await fetch(`http://127.0.0.1:${setup!.api.port}/swan/activity`, {
      method: "POST",
      headers: swanHeaders(setup!.operatorToken, session.client_session_id),
      body: JSON.stringify(activityBody),
    });
    expect(duplicateResponse.status).toBe(202);
    const duplicatePayload = (await duplicateResponse.json()) as {
      activity: { activity_type: string } | null;
      scheduled_threads: Array<{ recipe: string }>;
    };
    expect(duplicatePayload.activity).toBeNull();
    expect(duplicatePayload.scheduled_threads).toHaveLength(0);

    const findingsPayload = await waitFor(
      async () => {
        const response = await fetch(
          `http://127.0.0.1:${setup!.api.port}/swan/findings?target_type=object&target_id=veh_42&limit=20`,
          {
            headers: swanHeaders(setup!.operatorToken, session.client_session_id, {
              "Content-Type": undefined,
            }),
          },
        );
        expect(response.status).toBe(200);
        return (await response.json()) as {
          findings: Array<{ finding_kind: string; target_id: string }>;
        };
      },
      (payload) => payload.findings.length > 0,
    );

    expect(
      findingsPayload.findings.some((finding) => finding.finding_kind === "object_context"),
    ).toBe(true);

    const panelsArtifact = (await waitFor(
      () =>
        readSwanArtifact(
          setup!,
          session.session_id,
          session.client_session_id,
          "panels",
        ) as Promise<{
          projection: string;
          data: { objects: Record<string, Array<{ target_id: string }>> };
        }>,
      (artifact) => (artifact.data.objects.veh_42?.length ?? 0) > 0,
    )) as {
      projection: string;
      data: { objects: Record<string, Array<{ target_id: string }>> };
    };
    expect(panelsArtifact.projection).toBe("panels");
    expect(panelsArtifact.data.objects.veh_42?.length ?? 0).toBeGreaterThan(0);

    const mapArtifact = (await waitFor(
      () =>
        readSwanArtifact(setup!, session.session_id, session.client_session_id, "map") as Promise<{
          data: { overlays: Array<{ target_id: string }> };
        }>,
      (artifact) => artifact.data.overlays.some((overlay) => overlay.target_id === "veh_42"),
    )) as {
      data: { overlays: Array<{ target_id: string }> };
    };
    expect(mapArtifact.data.overlays.some((overlay) => overlay.target_id === "veh_42")).toBe(true);
  });

  it("creates notification artifacts for alert activity and preserves disabled-session artifacts", async () => {
    const { session } = await enableSwanSession(setup!, randomUUID());
    const alertId = "alert_swan_notification";

    await setup!.api.persistence.persistAlert({
      alert_id: alertId,
      rule_id: "source_error",
      severity: "critical",
      evidence_event_ids: ["evt_1"],
      evidence_object_ids: ["veh_42"],
      summary: "Swan alert notification test",
      explanation: "Verifies alert-focused Swan notifications.",
      confidence: 0.98,
    });

    const activityResponse = await fetch(`http://127.0.0.1:${setup!.api.port}/swan/activity`, {
      method: "POST",
      headers: swanHeaders(setup!.operatorToken, session.client_session_id),
      body: JSON.stringify({
        activity_type: "alert_opened",
        target_type: "alert",
        target_id: alertId,
        route: "/ops",
        mode: "replay",
        context: {
          alert_status: "open",
        },
      }),
    });

    expect(activityResponse.status).toBe(202);

    const notificationsArtifact = await waitFor(
      () =>
        readSwanArtifact(
          setup!,
          session.session_id,
          session.client_session_id,
          "notifications",
        ) as Promise<{
          data: { items: Array<{ target_id: string; verification_status: string }> };
        }>,
      (artifact) => artifact.data.items.some((item) => item.target_id === alertId),
    );

    expect(
      notificationsArtifact.data.items.some(
        (item) => item.target_id === alertId && item.verification_status === "trusted_source",
      ),
    ).toBe(true);

    const disableResponse = await fetch(`http://127.0.0.1:${setup!.api.port}/swan/session`, {
      method: "DELETE",
      headers: swanHeaders(setup!.operatorToken, session.client_session_id, {
        "Content-Type": undefined,
      }),
    });
    expect(disableResponse.status).toBe(200);

    const currentSessionResponse = await fetch(`http://127.0.0.1:${setup!.api.port}/swan/session`, {
      headers: swanHeaders(setup!.operatorToken, session.client_session_id, {
        "Content-Type": undefined,
      }),
    });
    expect(currentSessionResponse.status).toBe(200);
    expect((await currentSessionResponse.json()) as { session: unknown }).toEqual({
      session: null,
    });

    const disabledSessionArtifact = (await readSwanArtifact(
      setup!,
      session.session_id,
      session.client_session_id,
      "session",
    )) as {
      data: { session: { status: string } };
    };
    expect(disabledSessionArtifact.data.session.status).toBe("disabled");
  });
});

async function enableSwanSession(
  setup: Awaited<ReturnType<typeof setupAuthenticatedApi>>,
  clientSessionId: string,
): Promise<{
  session: { session_id: string; client_session_id: string; status: string };
}> {
  const response = await fetch(`http://127.0.0.1:${setup.api.port}/swan/session`, {
    method: "POST",
    headers: swanHeaders(setup.operatorToken, clientSessionId),
    body: JSON.stringify({
      client_session_id: clientSessionId,
      route: "/ops",
      mode: "replay",
      context: {
        active_layers: ["flights", "weather"],
      },
    }),
  });

  expect(response.status).toBe(201);
  return (await response.json()) as {
    session: { session_id: string; client_session_id: string; status: string };
  };
}

async function readSwanArtifact(
  setup: Awaited<ReturnType<typeof setupAuthenticatedApi>>,
  sessionId: string,
  clientSessionId: string,
  artifactKey: string,
): Promise<unknown> {
  const response = await fetch(
    `http://127.0.0.1:${setup.api.port}/swan/artifacts/${sessionId}/${artifactKey}`,
    {
      headers: swanHeaders(setup.operatorToken, clientSessionId, { "Content-Type": undefined }),
    },
  );

  expect(response.status).toBe(200);
  return response.json();
}

async function seedFixtureObject(
  setup: Awaited<ReturnType<typeof setupAuthenticatedApi>>,
): Promise<void> {
  const fixture = await loadJsonFixture("adapters", "fixture-telemetry", "valid.request.json");

  const ingestResponse = await fetch(
    `http://127.0.0.1:${setup.api.port}/ingest/fixture-telemetry`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${setup.operatorToken}`,
      },
      body: JSON.stringify(fixture),
    },
  );

  expect(ingestResponse.status).toBe(200);

  await setup.api.persistence.upsertSource({
    source_id: "cam_swan_1",
    source_type: "camera",
    name: "Swan Camera 1",
    status: "active",
    owner: "test-suite",
    auth_ref: "test://cam_swan_1",
    polling_mode: "pull",
    schema_version: SOURCE_SCHEMA_VERSION,
    created_at: "2026-04-12T09:00:00.000Z",
    updated_at: "2026-04-12T09:00:00.000Z",
  });

  await setup.api.persistence.upsertSourceRegistry({
    source_id: "cam_swan_1",
    source_type: "camera",
    provider: "Test Camera Grid",
    label: "Swan Camera 1",
    lat: -33.8687,
    lon: 151.2094,
    alt_m: 12,
    heading_deg: 45,
    coverage: null,
    status: "active",
    last_update: "2026-04-12T09:00:00.000Z",
    snapshot_available: true,
    live_available: true,
    linked_object_ids: ["veh_42"],
    linked_alert_ids: [],
    linked_incident_ids: [],
    metadata: {
      zone: "downtown",
    },
  });
}

async function waitFor<T>(
  loader: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 10000,
  intervalMs = 200,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await loader();
    if (predicate(value)) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return loader();
}

function swanHeaders(
  token: string,
  clientSessionId: string,
  extra: Record<string, string | undefined> = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "X-Client-Session-Id": clientSessionId,
    "Content-Type": "application/json",
  };

  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined) {
      delete headers[key];
      continue;
    }
    headers[key] = value;
  }

  return headers;
}
