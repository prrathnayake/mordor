import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  SWAN_ARTIFACT_PROJECTION_SCHEMA_VERSION,
  SWAN_FINDING_SCHEMA_VERSION,
  SWAN_SESSION_SCHEMA_VERSION,
  SWAN_THREAD_SCHEMA_VERSION,
  type SwanFinding,
  type SwanSession,
  type SwanThread,
} from "../../packages/contracts/src/index.js";
import {
  allowsLiveProjection,
  buildMapProjection,
  buildNotificationsProjection,
  buildPanelsProjection,
  buildSessionProjection,
  getAoiCenter,
  SwanArtifactStore,
} from "../../packages/swan/src/index.js";

describe("swan protocol helpers", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map((directory) => rm(directory, { force: true, recursive: true })),
    );
  });

  it("only allows live projections for cross-checked and trusted findings", () => {
    expect(allowsLiveProjection("unverified")).toBe(false);
    expect(allowsLiveProjection("single_source")).toBe(false);
    expect(allowsLiveProjection("cross_checked")).toBe(true);
    expect(allowsLiveProjection("trusted_source")).toBe(true);
  });

  it("builds session and panel projections from Swan state", () => {
    const session: SwanSession = {
      schema_version: SWAN_SESSION_SCHEMA_VERSION,
      session_id: "swan-session-1",
      client_session_id: "client-session-1",
      user_id: "usr_operator",
      status: "active",
      current_context: { route: "/ops" },
      last_activity_at: "2026-04-12T09:00:00.000Z",
      last_projection_at: null,
      created_at: "2026-04-12T09:00:00.000Z",
      updated_at: "2026-04-12T09:00:00.000Z",
    };
    const threads: SwanThread[] = [
      makeThread({ thread_id: "thread-1", status: "queued" }),
      makeThread({ thread_id: "thread-2", status: "running" }),
      makeThread({ thread_id: "thread-3", status: "running" }),
    ];
    const findings: SwanFinding[] = [
      makeFinding({
        finding_id: "finding-object",
        target_type: "object",
        target_id: "veh_42",
        projection_targets: ["panel", "map"],
      }),
      makeFinding({
        finding_id: "finding-alert",
        target_type: "alert",
        target_id: "alert_42",
        projection_targets: ["panel", "notification"],
      }),
      makeFinding({
        finding_id: "finding-incident",
        target_type: "incident",
        target_id: "incident_42",
        projection_targets: ["panel"],
      }),
      makeFinding({
        finding_id: "finding-hidden",
        target_type: "object",
        target_id: "veh_99",
        projection_targets: ["notification"],
      }),
    ];

    const sessionProjection = buildSessionProjection(session, threads);
    const panelsProjection = buildPanelsProjection(session.session_id, findings);
    const sessionData = sessionProjection.data as {
      session: SwanSession | null;
      thread_counts: Record<string, number>;
    };
    const panelsData = panelsProjection.data as {
      objects: Record<string, SwanFinding[]>;
      alerts: Record<string, SwanFinding[]>;
      incidents: Record<string, SwanFinding[]>;
    };

    expect(sessionProjection.schema_version).toBe(SWAN_ARTIFACT_PROJECTION_SCHEMA_VERSION);
    expect(sessionProjection.projection).toBe("session");
    expect(sessionData.thread_counts).toEqual({ queued: 1, running: 2 });

    expect(panelsProjection.projection).toBe("panels");
    expect(panelsData.objects.veh_42).toHaveLength(1);
    expect(panelsData.objects.veh_99).toBeUndefined();
    expect(panelsData.alerts.alert_42).toHaveLength(1);
    expect(panelsData.incidents.incident_42).toHaveLength(1);
  });

  it("gates map overlays and notifications by verification status", () => {
    const findings: SwanFinding[] = [
      makeFinding({
        finding_id: "map-cross-checked",
        title: "Cross checked",
        verification_status: "cross_checked",
        projection_targets: ["map", "notification"],
        lat: -33.8688,
        lon: 151.2093,
      }),
      makeFinding({
        finding_id: "map-trusted",
        title: "Trusted",
        verification_status: "trusted_source",
        projection_targets: ["map", "notification"],
        lat: -33.8687,
        lon: 151.2094,
      }),
      makeFinding({
        finding_id: "map-unverified",
        title: "Unverified",
        verification_status: "unverified",
        projection_targets: ["map", "notification"],
        lat: -33.8686,
        lon: 151.2095,
      }),
      makeFinding({
        finding_id: "map-no-coordinates",
        title: "No coordinates",
        verification_status: "cross_checked",
        projection_targets: ["map"],
        lat: null,
        lon: null,
      }),
    ];

    const mapProjection = buildMapProjection("swan-session-1", findings);
    const notificationsProjection = buildNotificationsProjection("swan-session-1", findings);
    const mapData = mapProjection.data as {
      overlays: Array<{ finding_id: string }>;
    };
    const notificationsData = notificationsProjection.data as {
      unread_count: number;
      items: Array<{ finding_id: string }>;
    };

    expect(mapData.overlays.map((overlay) => overlay.finding_id)).toEqual([
      "map-cross-checked",
      "map-trusted",
    ]);
    expect(notificationsData.items.map((item) => item.finding_id)).toEqual([
      "map-cross-checked",
      "map-trusted",
    ]);
    expect(notificationsData.unread_count).toBe(2);
  });

  it("derives AOI centers for point and polygon geometry", () => {
    expect(
      getAoiCenter({
        type: "Point",
        coordinates: [151.2093, -33.8688],
      }),
    ).toEqual({
      lat: -33.8688,
      lon: 151.2093,
    });

    const polygonCenter = getAoiCenter({
      type: "Polygon",
      coordinates: [
        [
          [151.2, -33.87],
          [151.21, -33.87],
          [151.21, -33.86],
          [151.2, -33.86],
        ],
      ],
    });

    expect(polygonCenter?.lat).toBeCloseTo(-33.865, 6);
    expect(polygonCenter?.lon).toBeCloseTo(151.205, 6);

    expect(getAoiCenter(null)).toBeNull();
  });

  it("writes Swan artifacts atomically to the expected paths", async () => {
    const artifactRoot = await mkdtemp(path.join(tmpdir(), "swan-artifact-store-"));
    tempDirs.push(artifactRoot);

    const store = new SwanArtifactStore(artifactRoot);
    const prepared = store.prepareArtifact("session-42", "threads/thread-42", {
      ok: true,
      value: 7,
    });

    expect(prepared.file_path).toBe(
      path.join(path.resolve(artifactRoot, "session-42"), "threads", "thread-42.json"),
    );

    await store.materializeArtifact(prepared);

    const raw = await readFile(prepared.file_path, "utf8");
    const siblings = await readdir(path.dirname(prepared.file_path));

    expect(JSON.parse(raw)).toEqual({ ok: true, value: 7 });
    expect(siblings.filter((entry) => entry.endsWith(".tmp"))).toHaveLength(0);
  });
});

function makeThread(overrides: Partial<SwanThread>): SwanThread {
  return {
    schema_version: SWAN_THREAD_SCHEMA_VERSION,
    thread_id: "thread-default",
    session_id: "swan-session-1",
    recipe: "context",
    target_type: "object",
    target_id: "veh_42",
    status: "queued",
    priority: 100,
    dedupe_key: "context:object:veh_42",
    is_recurring: false,
    recurrence_interval_ms: null,
    run_count: 0,
    queued_at: "2026-04-12T09:00:00.000Z",
    started_at: null,
    completed_at: null,
    last_run_at: null,
    next_run_at: null,
    error_message: null,
    context: {},
    created_at: "2026-04-12T09:00:00.000Z",
    updated_at: "2026-04-12T09:00:00.000Z",
    ...overrides,
  };
}

function makeFinding(overrides: Partial<SwanFinding>): SwanFinding {
  return {
    schema_version: SWAN_FINDING_SCHEMA_VERSION,
    finding_id: "finding-default",
    session_id: "swan-session-1",
    thread_id: "thread-default",
    provider: "app_context",
    target_type: "object",
    target_id: "veh_42",
    finding_kind: "object_context",
    title: "Vehicle 42",
    summary: "Vehicle 42 context.",
    details: {},
    verification_status: "trusted_source",
    confidence: 0.92,
    projection_targets: ["panel"],
    source_urls: [],
    media: [],
    lat: -33.8688,
    lon: 151.2093,
    generated_at: "2026-04-12T09:00:00.000Z",
    updated_at: "2026-04-12T09:00:00.000Z",
    ...overrides,
  };
}
