/**
 * MORDOR Tactical Operations Center
 * Main application logic for the tactical UI
 * Integrates with existing Chrona Twin backend functionality
 */

const appConfig = window.__APP_CONFIG__ || {};
const apiBaseUrl = appConfig.apiBaseUrl || "http://127.0.0.1:3000";
console.log("API Base URL:", apiBaseUrl);

const defaultMapImageryConfig = {
  provider: "arcgis-world-imagery",
  url: null,
  credit: null,
  maxLevel: 19,
};

const defaultStreetSceneConfig = {
  provider: "none",
  ionToken: null,
  googleApiKey: null,
};

// ===== STATE =====
let viewer;
let baseImagerySwapToken = 0;
let streetSceneLoadPromise = null;
const objectEntities = new Map();
let trackEntity = null;
let selectedObjectId = null;
let currentMode = "replay";
let eventSource = null;
let lastSequence = 0;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const latestStates = new Map();
const liveTrackHistory = new Map();
let _connectionState = "disconnected";
let hasCenteredOnLiveData = false;
let currentAlertId = null;
let liveSnapshotRequest = null;
let pendingLiveSnapshotReload = false;
const liveFlightsMeta = {
  count: 0,
  generatedAt: null,
};
const externalLayerRequests = new Map();
const pendingExternalLayerReloads = new Set();
let externalLayerViewportReloadTimer = null;
let liveEventsBoundsSignature = "";
let selectedSatelliteId = null;
let satelliteOrbitEntity = null;
let streetSceneTileset = null;

const sessionState = {
  token: null,
  user: null,
  role: null,
  isAuthenticated: false,
};

const replayState = {
  items: [],
  currentIndex: 0,
  intervalId: null,
  isPlaying: false,
};

const layerState = {
  flights: true,
  military: false,
  earthquakes: false,
  satellites: true,
  traffic: false,
  weather: false,
  cctv: true,
  bikeshare: false,
};

// External data layer state
const externalLayerState = {
  layers: new Map(), // layerId -> { status, count, lastUpdate, enabled, provider, errorMessage }
  entities: new Map(), // layerId -> Map of entityId -> Cesium entity
  eventCache: new Map(), // layerId -> Map of externalId -> event
};

// Incident state
const incidentState = {
  currentIncident: null,
  timeline: null,
  chapters: [],
  links: [],
  markers: [],
  entities: new Map(),
  contextEntities: new Map(),
  intelligenceEntities: new Map(),
  captureJobs: [],
  evidence: [],
  intelligence: {
    artifacts: [],
    widgets: [],
    runs: [],
    updatedAt: null,
  },
  playback: {
    isPlaying: false,
    intervalId: null,
    speed: 1,
    currentTime: null,
    section: "during", // "before", "during", "after"
  },
  isActive: false,
};

// Inferred intelligence state
const inferenceState = {
  inferences: [],
  degradationZones: [],
  routeRedirections: [],
  holdingPatterns: [],
  entities: new Map(), // inferenceId -> Cesium entity
  layers: {
    degradation: false,
    redirection: false,
    holding: false,
    absence: false,
  },
};

// Layer status colors for UI
const _LAYER_STATUS_COLORS = {
  real: "#22c55e", // Green
  degraded: "#f59e0b", // Amber
  unavailable: "#ef4444", // Red
};

const visualState = {
  preset: "crt",
  bloom: 20,
  sharpen: 30,
  pixelate: 0,
  distortion: 10,
  instability: 5,
  hud: true,
  layout: "expanded",
  detect: false,
  panoptic: false,
  mapSurface: appConfig.mapImagery?.provider === "osm-street" ? "street" : "satellite",
  streetSceneReady: false,
  streetSceneStatus: "idle",
};

const swanState = {
  clientSessionId: null,
  enabled: false,
  session: null,
  syncToken: 0,
  projections: {
    session: null,
    panels: null,
    map: null,
    notifications: null,
  },
  overlayEntities: new Map(),
  seenNotificationIds: new Set(),
  pendingActivities: new Map(),
};

const newsState = {
  items: [],
  clusters: [],
  feeds: [],
  fetchedAt: null,
  enabled: false,
  categoryFilter: "",
  totalCount: 0,
  criticalCount: 0,
  activeFeeds: 0,
};

const webcamState = {
  channels: [],
  regions: [],
  enabled: false,
  regionFilter: "",
  activeEmbeds: new Set(),
};

// ===== CIRCUIT BREAKERS =====
class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.maxFailures = options.maxFailures ?? 2;
    this.cooldownMs = options.cooldownMs ?? 5 * 60 * 1000;
    this.state = { failures: 0, cooldownUntil: 0, lastError: null };
    this.cache = new Map();
    this.cacheTtlMs = options.cacheTtlMs ?? 10 * 60 * 1000;
  }

  async execute(fn, defaultValue, _options = {}) {
    const now = Date.now();
    if (now < this.state.cooldownUntil) {
      return defaultValue;
    }

    try {
      const result = await fn();
      this.state.failures = 0;
      this.state.lastError = null;
      return result;
    } catch (error) {
      this.state.failures += 1;
      this.state.lastError = String(error.message || error);
      if (this.state.failures >= this.maxFailures) {
        this.state.cooldownUntil = now + this.cooldownMs;
        console.warn(
          `[CircuitBreaker] ${this.name} tripped. Cooling down for ${this.cooldownMs}ms`,
        );
      }
      return defaultValue;
    }
  }

  isOpen() {
    return Date.now() < this.state.cooldownUntil;
  }
}

const layerCircuitBreakers = new Map();
function getLayerCircuitBreaker(layerId) {
  if (!layerCircuitBreakers.has(layerId)) {
    layerCircuitBreakers.set(
      layerId,
      new CircuitBreaker(`layer:${layerId}`, { maxFailures: 3, cooldownMs: 60000 }),
    );
  }
  return layerCircuitBreakers.get(layerId);
}

// ===== SMART POLLING =====
const smartPollHandles = new Map();

function startSmartPollLoop(name, fn, options = {}) {
  const {
    intervalMs = 60000,
    pauseWhenHidden = true,
    maxBackoffMultiplier = 4,
    jitterFraction = 0.1,
  } = options;

  const currentInterval = intervalMs;
  let multiplier = 1;
  let timerId = null;
  let running = true;

  const schedule = () => {
    if (!running) return;
    const jitter = intervalMs * jitterFraction * (Math.random() * 2 - 1);
    const delay = Math.max(1000, currentInterval * multiplier + jitter);
    timerId = setTimeout(async () => {
      if (pauseWhenHidden && document.hidden) {
        schedule();
        return;
      }
      try {
        await fn();
        multiplier = 1;
      } catch (_e) {
        multiplier = Math.min(maxBackoffMultiplier, multiplier * 2);
        console.warn(`[SmartPoll] ${name} failed, backoff multiplier ${multiplier}`);
      }
      schedule();
    }, delay);
  };

  schedule();

  return {
    stop() {
      running = false;
      if (timerId) clearTimeout(timerId);
    },
  };
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    // Smart polling handles pause/resume automatically.
    // No extra flush needed — smart polling resumes via its own schedule().
  }
});

// ===== URL STATE SYNC =====
const URL_SYNC_DEBOUNCE_MS = 250;
let urlSyncTimeout = null;

function syncStateToUrl() {
  if (urlSyncTimeout) clearTimeout(urlSyncTimeout);
  urlSyncTimeout = setTimeout(() => {
    const params = new URLSearchParams();

    if (currentMode !== "replay") {
      params.set("mode", currentMode);
    }

    const activeLayers = Object.entries(layerState)
      .filter(([, enabled]) => enabled)
      .map(([id]) => id);
    if (activeLayers.length > 0) {
      params.set("layers", activeLayers.join(","));
    }

    if (incidentState.currentIncident?.incident_id) {
      params.set("incident", incidentState.currentIncident.incident_id);
    }

    const newUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(null, "", newUrl);
  }, URL_SYNC_DEBOUNCE_MS);
}

function restoreStateFromUrl() {
  const params = new URLSearchParams(window.location.search);

  const mode = params.get("mode");
  if (mode === "live" || mode === "replay") {
    if (mode === "live") switchToLiveMode();
    else switchToReplayMode();
  }

  const layersParam = params.get("layers");
  if (layersParam) {
    const enabled = new Set(layersParam.split(","));
    for (const key of Object.keys(layerState)) {
      layerState[key] = enabled.has(key);
      const checkbox = document.getElementById(`layer-${key}`);
      if (checkbox && checkbox.checked !== enabled.has(key)) {
        checkbox.checked = enabled.has(key);
        checkbox.dispatchEvent(new Event("change"));
      }
    }
  }

  const incidentId = params.get("incident");
  if (incidentId) {
    setTimeout(() => openIncident(incidentId), 500);
  }
}

// ===== BREAKING NEWS BANNER =====
const breakingNewsState = {
  activeAlerts: [],
  maxAlerts: 3,
};

function showBreakingAlert(alert) {
  const banner = document.getElementById("breaking-news-banner");
  if (!banner) return;

  // Deduplicate by ID
  if (breakingNewsState.activeAlerts.some((a) => a.id === alert.id)) return;

  // Evict lower priority if at max
  if (breakingNewsState.activeAlerts.length >= breakingNewsState.maxAlerts) {
    const lowestIndex = breakingNewsState.activeAlerts.findIndex(
      (a) => severityRank(a.severity) < severityRank(alert.severity),
    );
    if (lowestIndex === -1) return;
    const evicted = breakingNewsState.activeAlerts.splice(lowestIndex, 1)[0];
    const evictedEl = document.getElementById(`breaking-alert-${evicted.id}`);
    if (evictedEl) evictedEl.remove();
  }

  breakingNewsState.activeAlerts.push(alert);

  const el = document.createElement("div");
  el.id = `breaking-alert-${alert.id}`;
  el.className = `breaking-alert severity-${alert.severity}`;
  el.innerHTML = `
    <span>▶</span>
    <span class="breaking-alert-title">${escapeHtml(alert.title)}</span>
    <span class="breaking-alert-meta">${escapeHtml(alert.source || "SYSTEM")}</span>
    <button class="breaking-alert-dismiss" onclick="dismissBreakingAlert('${alert.id}')">&times;</button>
  `;
  el.addEventListener("click", (e) => {
    if (e.target.closest(".breaking-alert-dismiss")) return;
    if (alert.onClick) alert.onClick();
  });

  banner.appendChild(el);
  banner.style.display = "flex";

  // Update header status indicator
  const alertStatus = document.getElementById("status-message");
  if (alertStatus && alert.severity === "critical") {
    alertStatus.textContent = "ALERT";
    alertStatus.style.color = "#ef4444";
  }

  // Auto-dismiss
  const ttl = alert.severity === "critical" ? 60000 : alert.severity === "high" ? 30000 : 15000;
  setTimeout(() => dismissBreakingAlert(alert.id), ttl);
}

function dismissBreakingAlert(id) {
  const banner = document.getElementById("breaking-news-banner");
  const el = document.getElementById(`breaking-alert-${id}`);
  if (el) el.remove();
  breakingNewsState.activeAlerts = breakingNewsState.activeAlerts.filter((a) => a.id !== id);
  if (breakingNewsState.activeAlerts.length === 0 && banner) {
    banner.style.display = "none";
  }
}

function severityRank(severity) {
  const ranks = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  return ranks[severity] ?? 0;
}

// ===== DOM REFERENCES =====
const dom = {
  // Header
  modeValue: document.getElementById("mode-value") || { value: "", textContent: "" },
  statusMessage: document.getElementById("status-message") || { textContent: "" },
  connectionText: document.getElementById("connection-text") || { textContent: "" },
  sessionStatus: document.getElementById("session-status") || { textContent: "" },
  authButton: document.getElementById("auth-button"),
  swanToggle: document.getElementById("swan-toggle"),
  newsToggle: document.getElementById("news-toggle"),
  swanStatus: document.getElementById("swan-status") || { textContent: "" },
  swanNotifications: document.getElementById("swan-notifications"),
  timeDisplay: document.getElementById("time-display") || { textContent: "" },
  activeLayersCount: document.getElementById("active-layers-count") || { textContent: "" },
  flightsCount: document.getElementById("flights-count") || { textContent: "" },
  flightsUpdate: document.getElementById("flights-update") || { textContent: "" },

  // Login Modal
  loginModal: document.getElementById("login-modal"),
  closeLogin: document.getElementById("close-login"),
  usernameInput: document.getElementById("username"),
  passwordInput: document.getElementById("password"),
  submitLogin: document.getElementById("submit-login"),
  cancelLogin: document.getElementById("cancel-login"),

  // Query Modal
  queryModal: document.getElementById("query-modal"),
  closeQuery: document.getElementById("close-query"),
  startAt: document.getElementById("start-at"),
  endAt: document.getElementById("end-at"),
  objectId: document.getElementById("object-id"),
  loadReplayBtn: document.getElementById("load-replay"),
  cancelQuery: document.getElementById("cancel-query"),
  queryFormToggle: document.getElementById("query-form-toggle"),

  // Alert Modal
  alertModal: document.getElementById("alert-modal"),
  closeAlert: document.getElementById("close-alert"),
  alertDetailContent: document.getElementById("alert-detail-content"),
  alertActions: document.getElementById("alert-actions"),

  // Footer Controls
  playReplay: document.getElementById("play-replay"),
  pauseReplay: document.getElementById("pause-replay"),
  stepReplay: document.getElementById("step-replay"),
  resetReplay: document.getElementById("reset-replay"),
  timelineSlider: document.getElementById("timeline-slider"),
  timelinePosition: document.getElementById("timeline-position"),
  replayTimestamp: document.getElementById("replay-timestamp"),
  modeLive: document.getElementById("mode-live"),
  modeReplay: document.getElementById("mode-replay"),
  loadReplayButton: document.getElementById("load-replay-btn"),

  // Alerts Strip
  alertsCount: document.getElementById("alerts-count"),
  alertsListMini: document.getElementById("alerts-list-mini"),

  // Source Health
  sourceList: document.getElementById("source-list"),
  healthIndicator: document.getElementById("health-indicator"),

  // Layers
  layerFlights: document.getElementById("layer-flights"),
  layerMilitary: document.getElementById("layer-military"),
  layerEarthquakes: document.getElementById("layer-earthquakes"),
  layerSatellites: document.getElementById("layer-satellites"),
  layerTraffic: document.getElementById("layer-traffic"),
  layerWeather: document.getElementById("layer-weather"),
  layerCctv: document.getElementById("layer-cctv"),
  layerBikeshare: document.getElementById("layer-bikeshare"),

  // Visual Controls
  presetButtons: document.querySelectorAll(".preset-button"),
  surfaceButtons: document.querySelectorAll(".surface-button"),
  bloomSlider: document.getElementById("bloom-slider"),
  sharpenSlider: document.getElementById("sharpen-slider"),
  pixelateSlider: document.getElementById("pixelate-slider"),
  distortionSlider: document.getElementById("distortion-slider"),
  instabilitySlider: document.getElementById("instability-slider"),
  surfaceSatellite: document.getElementById("surface-satellite"),
  surfaceStreet: document.getElementById("surface-street"),
  toggleHud: document.getElementById("toggle-hud"),
  layoutSelect: document.getElementById("layout-select"),
  toggleDetect: document.getElementById("toggle-detect"),
  togglePanoptic: document.getElementById("toggle-panoptic"),

  // Inspector
  inspectorContent: document.getElementById("inspector-content"),

  // CCTV
  cctvContent: document.getElementById("cctv-content"),

  // Events Panel
  eventsPanel: document.getElementById("events-panel"),
  closeEvents: document.getElementById("close-events"),
  eventList: document.getElementById("event-list"),

  // Viewport
  coordinates: document.getElementById("coordinates"),
  zoomLevel: document.getElementById("zoom-level"),

  // Incident Panel
  incidentPanel: document.getElementById("incident-panel"),
  closeIncident: document.getElementById("close-incident"),
  incidentTitle: document.getElementById("incident-title"),
  incidentSeverity: document.getElementById("incident-severity"),
  incidentStatus: document.getElementById("incident-status"),
  incidentTime: document.getElementById("incident-time"),
  btnBefore: document.getElementById("btn-before"),
  btnDuring: document.getElementById("btn-during"),
  btnAfter: document.getElementById("btn-after"),
  beforeCount: document.getElementById("before-count"),
  duringCount: document.getElementById("during-count"),
  afterCount: document.getElementById("after-count"),
  incidentChapters: document.getElementById("incident-chapters"),
  incidentPlay: document.getElementById("incident-play"),
  incidentPause: document.getElementById("incident-pause"),
  incidentScrubber: document.getElementById("incident-scrubber"),
  incidentSpeed: document.getElementById("incident-speed"),

  // Incident Modal
  incidentModal: document.getElementById("incident-modal"),
  closeIncidentModal: document.getElementById("close-incident-modal"),
  incidentList: document.getElementById("incident-list"),
  btnNewIncident: document.getElementById("btn-new-incident"),
  newIncidentModal: document.getElementById("new-incident-modal"),
  closeNewIncidentModal: document.getElementById("close-new-incident-modal"),
  incidentTitleInput: document.getElementById("incident-title-input"),
  incidentDescInput: document.getElementById("incident-desc-input"),
  incidentStartInput: document.getElementById("incident-start-input"),
  incidentEndInput: document.getElementById("incident-end-input"),
  incidentSeverityInput: document.getElementById("incident-severity-input"),
  incidentTagsInput: document.getElementById("incident-tags-input"),
  btnCancelIncident: document.getElementById("btn-cancel-incident"),
  btnCreateIncident: document.getElementById("btn-create-incident"),

  // Capture Panel
  captureSection: document.getElementById("incident-capture-section"),
  captureJobList: document.getElementById("capture-job-list"),
  evidenceList: document.getElementById("evidence-list"),
  btnAddCapture: document.getElementById("btn-add-capture"),
  incidentIntelligenceStatus: document.getElementById("incident-intelligence-status"),
  incidentIntelligenceContent: document.getElementById("incident-intelligence-content"),
  btnRefreshIncidentIntelligence: document.getElementById("btn-refresh-incident-intelligence"),

  // Inference Panel
  inferencePanel: document.getElementById("inference-panel"),
  inferenceCount: document.getElementById("inference-count"),
  inferenceLayers: document.getElementById("inference-layers"),
  inferenceList: document.getElementById("inference-list"),
  degradationCount: document.getElementById("degradation-count"),
  redirectionCount: document.getElementById("redirection-count"),
  holdingCount: document.getElementById("holding-count"),
  absenceCount: document.getElementById("absence-count"),
  layerDegradation: document.getElementById("layer-degradation"),
  layerRedirection: document.getElementById("layer-redirection"),
  layerHolding: document.getElementById("layer-holding"),
  layerAbsence: document.getElementById("layer-absence"),
};

// ===== UTILITY FUNCTIONS =====
function formatTime(date) {
  return date.toLocaleTimeString("en-US", { hour12: false });
}

function updateTime() {
  dom.timeDisplay.textContent = formatTime(new Date());
}

function updateStatus(message) {
  console.log("updateStatus called:", message);
  if (dom.statusMessage) {
    dom.statusMessage.textContent = message.toUpperCase();
  }
}

function updateConnectionStatus(state, details = "") {
  _connectionState = state;
  const stateLabels = {
    disconnected: "DISCONNECTED",
    connecting: "CONNECTING...",
    connected: "CONNECTED",
    reconnecting: `RECONNECTING ${reconnectAttempts}/${maxReconnectAttempts}`,
    error: "CONNECTION ERROR",
  };
  dom.connectionText.textContent = details
    ? `${stateLabels[state]}: ${details}`.toUpperCase()
    : stateLabels[state];
}

function getAuthHeaders() {
  if (!sessionState.token) return {};
  return { Authorization: `Bearer ${sessionState.token}` };
}

function canManageAlerts() {
  return (
    sessionState.isAuthenticated &&
    (sessionState.role === "operator" || sessionState.role === "admin")
  );
}

function getApiBaseUrl() {
  return apiBaseUrl;
}

function getMapImageryConfig() {
  return {
    ...defaultMapImageryConfig,
    ...(appConfig.mapImagery || {}),
  };
}

function getStreetSceneConfig() {
  return {
    ...defaultStreetSceneConfig,
    ...(appConfig.streetScene || {}),
  };
}

function isStreetSceneConfigured() {
  return getStreetSceneConfig().provider !== "none";
}

function configureCesiumCredentials() {
  const streetScene = getStreetSceneConfig();

  if (streetScene.ionToken) {
    Cesium.Ion.defaultAccessToken = streetScene.ionToken;
  }

  if (streetScene.googleApiKey && Cesium.GoogleMaps) {
    Cesium.GoogleMaps.defaultApiKey = streetScene.googleApiKey;
  }
}

function getMapImageryConfigForSurface(surface = visualState.mapSurface) {
  const configured = getMapImageryConfig();

  if (surface === "street") {
    if (configured.provider === "osm-street") {
      return configured;
    }

    return {
      ...defaultMapImageryConfig,
      provider: "osm-street",
      url: null,
      credit: null,
      maxLevel: 19,
    };
  }

  if (configured.provider === "osm-street") {
    return defaultMapImageryConfig;
  }

  return configured;
}

async function createBaseImageryProvider(surface = visualState.mapSurface) {
  const mapImagery = getMapImageryConfigForSurface(surface);
  const provider = mapImagery.provider || defaultMapImageryConfig.provider;
  const credit = mapImagery.credit || undefined;
  const maxLevel =
    typeof mapImagery.maxLevel === "number" && Number.isFinite(mapImagery.maxLevel)
      ? mapImagery.maxLevel
      : defaultMapImageryConfig.maxLevel;

  switch (provider) {
    case "osm-street":
      return new Cesium.OpenStreetMapImageryProvider({
        url: mapImagery.url || "https://tile.openstreetmap.org/",
        credit,
        maximumLevel: maxLevel,
      });
    case "url-template":
      if (!mapImagery.url) {
        throw new Error("MAP_IMAGERY_URL is required when MAP_IMAGERY_PROVIDER=url-template");
      }
      return new Cesium.UrlTemplateImageryProvider({
        url: mapImagery.url,
        credit,
        maximumLevel: maxLevel,
      });
    case "arcgis-world-imagery":
      return Cesium.ArcGisMapServerImageryProvider.fromUrl(
        mapImagery.url ||
          "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
        {
          credit,
          enablePickFeatures: false,
        },
      );
  }
}

async function createStreetSceneTileset() {
  const streetScene = getStreetSceneConfig();

  switch (streetScene.provider) {
    case "google-photorealistic":
      return Cesium.createGooglePhotorealistic3DTileset(
        {
          key: streetScene.googleApiKey || undefined,
          onlyUsingWithGoogleGeocoder: true,
        },
        {
          enableCollision: true,
          maximumScreenSpaceError: 8,
        },
      );
    case "osm-buildings":
      return Cesium.createOsmBuildingsAsync({
        enableCollision: true,
      });
    default:
      throw new Error("Street scene provider is not configured");
  }
}

async function ensureStreetSceneTileset() {
  if (!viewer || typeof Cesium === "undefined") {
    throw new Error("Viewer unavailable");
  }

  if (!isStreetSceneConfigured()) {
    throw new Error("Street scene not configured");
  }

  if (streetSceneTileset) {
    visualState.streetSceneReady = true;
    visualState.streetSceneStatus = "ready";
    return streetSceneTileset;
  }

  if (!streetSceneLoadPromise) {
    visualState.streetSceneStatus = "loading";
    streetSceneLoadPromise = createStreetSceneTileset()
      .then((tileset) => {
        tileset.show = true;
        viewer.scene.primitives.add(tileset);
        streetSceneTileset = tileset;
        visualState.streetSceneReady = true;
        visualState.streetSceneStatus = "ready";
        return tileset;
      })
      .catch((error) => {
        visualState.streetSceneReady = false;
        visualState.streetSceneStatus = "error";
        streetSceneLoadPromise = null;
        throw error;
      });
  }

  return streetSceneLoadPromise;
}

function updateMapSurfaceControls() {
  dom.surfaceButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.surface === visualState.mapSurface);
  });
}

function getStreetSceneStatusLabel() {
  if (!isStreetSceneConfigured()) {
    return "UNAVAILABLE";
  }

  switch (visualState.streetSceneStatus) {
    case "loading":
      return "LOADING";
    case "ready":
      return "READY";
    case "error":
      return "ERROR";
    default:
      return "STANDBY";
  }
}

function bindInspectorActions(state) {
  const groundViewButton = document.getElementById("inspector-ground-view");
  if (!groundViewButton) {
    return;
  }

  groundViewButton.addEventListener("click", async () => {
    if (!state?.position) {
      return;
    }

    try {
      updateStatus("GROUND VIEW");
      await ensureStreetSceneTileset();
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          state.position.lon,
          state.position.lat,
          Math.max(state.position.altitude_m || 0, 120),
        ),
        orientation: {
          heading: Cesium.Math.toRadians(state.velocity?.heading_deg || 0),
          pitch: Cesium.Math.toRadians(-18),
          roll: 0,
        },
        duration: 1.4,
      });
    } catch (error) {
      console.error("Failed to enter ground view:", error);
      updateStatus("GROUND VIEW UNAVAILABLE");
    }

    if (selectedObjectId) {
      const nextState =
        currentMode === "live" ? latestStates.get(selectedObjectId) : getCurrentReplayState();
      updateInspectorFromState(selectedObjectId, nextState);
    }
  });
}

async function setMapSurface(surface) {
  if (!viewer || typeof Cesium === "undefined") return;

  visualState.mapSurface = surface;
  updateMapSurfaceControls();
  updateStatus(surface === "street" ? "STREET MAP" : "SATELLITE MAP");

  const swapToken = ++baseImagerySwapToken;

  try {
    const provider = await createBaseImageryProvider(surface);
    if (swapToken !== baseImagerySwapToken) {
      return;
    }

    const imageryLayers = viewer.imageryLayers;
    if (imageryLayers.length > 0) {
      imageryLayers.remove(imageryLayers.get(0), true);
    }
    imageryLayers.addImageryProvider(provider, 0);
  } catch (error) {
    console.error("Failed to swap map imagery:", error);
    updateStatus("BASEMAP ERROR");
  }
}

function getSwanClientSessionId() {
  if (swanState.clientSessionId) {
    return swanState.clientSessionId;
  }

  const storageKey = "swan_client_session_id";
  const stored =
    typeof window !== "undefined" && window.sessionStorage
      ? window.sessionStorage.getItem(storageKey)
      : null;

  if (stored) {
    swanState.clientSessionId = stored;
    return stored;
  }

  const nextId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `swan_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  if (typeof window !== "undefined" && window.sessionStorage) {
    window.sessionStorage.setItem(storageKey, nextId);
  }

  swanState.clientSessionId = nextId;
  return nextId;
}

function getSwanHeaders(extraHeaders = {}) {
  return {
    "Content-Type": "application/json",
    "X-Client-Session-Id": getSwanClientSessionId(),
    ...getAuthHeaders(),
    ...extraHeaders,
  };
}

function updateSwanUI() {
  const isActive = swanState.enabled && swanState.session;
  if (dom.swanToggle) {
    dom.swanToggle.textContent = isActive ? "SWAN ON" : "SWAN OFF";
    dom.swanToggle.classList.toggle("active", Boolean(isActive));
    dom.swanToggle.disabled = !sessionState.isAuthenticated;
  }

  if (dom.swanStatus) {
    const unread =
      swanState.projections.notifications?.data?.unread_count ||
      swanState.projections.notifications?.data?.items?.length ||
      0;
    dom.swanStatus.textContent = isActive ? `ACTIVE ${unread}` : "IDLE";
    dom.swanStatus.classList.toggle("active", Boolean(isActive));
  }
}

function showSwanToast(notification) {
  if (!dom.swanNotifications) return;
  if (swanState.seenNotificationIds.has(notification.finding_id)) return;

  swanState.seenNotificationIds.add(notification.finding_id);
  const toast = document.createElement("div");
  toast.className = "swan-toast";
  toast.innerHTML = `
    <div class="swan-toast-title">${notification.title}</div>
    <div class="swan-toast-summary">${notification.summary}</div>
    <div class="swan-toast-meta">${notification.verification_status.replace("_", " ")}</div>
  `;

  dom.swanNotifications.appendChild(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 5000);
}

const insightState = {
  events: [],
  unreadCount: 0,
};

function handleInsightEvent(data) {
  const insight = data.payload || data;
  insightState.events.unshift(insight);
  if (insightState.events.length > 100) {
    insightState.events.pop();
  }

  switch (insight.type) {
    case "map_popup":
      insightState.unreadCount++;
      showInsightPopup(insight);
      break;
    case "alert_badge":
      insightState.unreadCount++;
      updateInsightBadge(insightState.unreadCount);
      break;
    case "event_log":
      addInsightToLog(insight);
      break;
    case "inspector_update":
      updateInspectorWithInsight(insight);
      break;
  }

  if (insight.location && (insight.type === "map_popup" || insight.type === "alert_badge")) {
    addInsightMarkerToMap(insight);
  }
}

function showInsightPopup(insight) {
  const popup = document.createElement("div");
  popup.className = `insight-popup insight-popup-${insight.severity}`;
  popup.innerHTML = `
    <div class="insight-popup-header">
      <span class="insight-severity-badge">${insight.severity.toUpperCase()}</span>
      <button class="insight-popup-close">&times;</button>
    </div>
    <div class="insight-popup-title">${insight.title}</div>
    <div class="insight-popup-message">${insight.message}</div>
    <div class="insight-popup-actions">
      ${insight.actions.map((action) => `<button class="insight-action" data-action="${action.actionType}" data-insight="${insight.insightId}">${action.label}</button>`).join("")}
    </div>
  `;

  document.body.appendChild(popup);

  popup.querySelector(".insight-popup-close")?.addEventListener("click", () => popup.remove());
  popup.querySelectorAll(".insight-action").forEach((btn) => {
    btn.addEventListener("click", (e) =>
      handleInsightAction(e.target.dataset.action, e.target.dataset.insight),
    );
  });

  if (insight.severity === "critical") {
    setTimeout(() => popup.remove(), 10000);
  }
}

function updateInsightBadge(count) {
  const badge = document.getElementById("insight-badge");
  if (badge) {
    badge.textContent = count;
    badge.style.display = count > 0 ? "flex" : "none";
  }
}

function addInsightToLog(insight) {
  const logContainer = document.getElementById("insight-log");
  if (!logContainer) return;

  const entry = document.createElement("div");
  entry.className = `insight-log-entry insight-log-${insight.severity}`;
  entry.innerHTML = `
    <span class="insight-log-time">${new Date(insight.timestamp).toLocaleTimeString()}</span>
    <span class="insight-log-severity">[${insight.severity.toUpperCase()}]</span>
    <span class="insight-log-title">${insight.title}</span>
  `;
  logContainer.insertBefore(entry, logContainer.firstChild);

  while (logContainer.children.length > 50) {
    logContainer.removeChild(logContainer.lastChild);
  }
}

function updateInspectorWithInsight(insight) {
  if (selectedObjectId && insight.entityIds?.includes(selectedObjectId)) {
    const inspector = document.getElementById("inspector-insights");
    if (inspector) {
      inspector.innerHTML += `<div class="inspector-insight">${insight.title}</div>`;
    }
  }
}

function addInsightMarkerToMap(insight) {
  if (!insight.location || !viewer) return;
  // Add Cesium entity marker for insight location
}

async function handleInsightAction(actionType, insightId) {
  const endpoint = `/insights/${insightId}/${actionType}`;
  try {
    const response = await fetch(`${apiBaseUrl}${endpoint}`, {
      method: "POST",
      headers: sessionState.token ? { Authorization: `Bearer ${sessionState.token}` } : {},
    });
    if (response.ok) {
      insightState.unreadCount = Math.max(0, insightState.unreadCount - 1);
      updateInsightBadge(insightState.unreadCount);
    }
  } catch (error) {
    console.error("Insight action failed:", error);
  }
}

function showAuthModal() {
  dom.loginModal?.classList.remove("hidden");
  dom.usernameInput?.focus();
}

function updateActiveLayersCount() {
  const activeCount = Object.values(layerState).filter(Boolean).length;
  dom.activeLayersCount.textContent = `${activeCount}/8`;
}

function syncLayerStateFromDom() {
  layerState.flights = Boolean(dom.layerFlights?.checked);
  layerState.military = Boolean(dom.layerMilitary?.checked);
  layerState.earthquakes = Boolean(dom.layerEarthquakes?.checked);
  layerState.satellites = Boolean(dom.layerSatellites?.checked);
  layerState.traffic = Boolean(dom.layerTraffic?.checked);
  layerState.weather = Boolean(dom.layerWeather?.checked);
  layerState.cctv = Boolean(dom.layerCctv?.checked);
  layerState.bikeshare = Boolean(dom.layerBikeshare?.checked);
  syncStateToUrl();
}

// ===== AUTHENTICATION =====
function updateSessionUI() {
  console.log("updateSessionUI called, isAuthenticated:", sessionState.isAuthenticated);
  console.log("sessionState:", sessionState);

  const sessionStatus = document.getElementById("session-status") ?? dom.sessionStatus;
  const authButton = document.getElementById("auth-button") ?? dom.authButton;

  if (sessionState.isAuthenticated && sessionState.user) {
    const statusText = `${sessionState.user.username.toUpperCase()} (${sessionState.role?.toUpperCase() || "USER"})`;
    if (sessionStatus) {
      sessionStatus.textContent = statusText;
      console.log("Set session-status to:", statusText);
    }
    if (authButton) {
      authButton.textContent = "LOGOUT";
      console.log("Set auth-button to: LOGOUT");
    }
  } else {
    if (sessionStatus) {
      sessionStatus.textContent = "NO SESSION";
      console.log("Set session-status to: NO SESSION");
    }
    if (authButton) {
      authButton.textContent = "LOGIN";
      console.log("Set auth-button to: LOGIN");
    }
  }

  // Force refresh the display
  document.body.classList.toggle("authenticated", sessionState.isAuthenticated);
  console.log("Updated body.authenticated class:", sessionState.isAuthenticated);
}

function handleAuthClick() {
  if (sessionState.isAuthenticated) {
    logout();
  } else {
    showAuthModal();
  }
}

async function login(username, password) {
  const loginUrl = `${apiBaseUrl}/auth/login`;
  console.log("API Base URL:", apiBaseUrl);
  console.log("Attempting login to:", loginUrl);
  console.log("Username:", username);

  try {
    const response = await fetch(loginUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    console.log("Login response status:", response.status);
    console.log("Login response statusText:", response.statusText);

    if (!response.ok) {
      const errText = await response.text();
      console.log("Login error response:", errText);
      alert(`Login failed: ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json();
    console.log("Login response data:", JSON.stringify(data));

    if (data.token) {
      sessionState.token = data.token;
      sessionState.user = data.user;
      sessionState.role = data.user?.role;
      sessionState.isAuthenticated = true;
      localStorage.setItem("auth_token", data.token);
      updateSessionUI();
      dom.loginModal.classList.add("hidden");
      updateStatus("AUTHENTICATED");
      loadAlerts();
      hydrateSwanSession().catch((error) => {
        console.error("Failed to hydrate Swan after login:", error);
      });
      if (currentMode === "live") {
        queueLiveSnapshotReload();
      }
      alert("Login successful!");
    } else {
      alert(`Login failed: ${data.error || data.message || "Unknown error"}`);
    }
  } catch (error) {
    console.error("Login fetch error:", error);
    alert(`Network error: ${error.message}\n\nIs the API server running at ${apiBaseUrl}?`);
  }
}

function logout() {
  const hadSwan = swanState.enabled;
  if (hadSwan) {
    disableSwan().catch(() => {});
  }
  if (sessionState.token) {
    fetch(`${apiBaseUrl}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ token: sessionState.token }),
    }).catch(() => {});
  }
  sessionState.token = null;
  sessionState.user = null;
  sessionState.role = null;
  sessionState.isAuthenticated = false;
  localStorage.removeItem("auth_token");
  latestStates.clear();
  swanState.seenNotificationIds.clear();
  updateSessionUI();
  updateSwanUI();
  updateStatus("LOGGED OUT");
  renderMapMarkers();
  dom.alertsCount.textContent = "0";
  dom.alertsCount.classList.add("zero");
  dom.alertsListMini.innerHTML = '<span class="no-alerts">Auth required</span>';
}

function handleUnauthorized(response) {
  if (response.status === 401 || response.status === 403) {
    logout();
    return true;
  }
  return false;
}

async function validateSession(token) {
  try {
    const response = await fetch(`${apiBaseUrl}/auth/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (response.ok) {
      const data = await response.json();
      return { valid: true, user: data.user };
    } else if (response.status === 401) {
      return { valid: false };
    }
  } catch {
    return { valid: false };
  }
  return { valid: false };
}

async function initSession() {
  const savedToken = localStorage.getItem("auth_token");
  if (savedToken) {
    const validation = await validateSession(savedToken);
    if (validation.valid && validation.user) {
      sessionState.token = savedToken;
      sessionState.user = validation.user;
      sessionState.role = validation.user.role;
      sessionState.isAuthenticated = true;
      updateSessionUI();
      updateStatus("SESSION RESTORED");
      await hydrateSwanSession();
    } else {
      localStorage.removeItem("auth_token");
      sessionState.isAuthenticated = false;
      updateSessionUI();
      updateSwanUI();
    }
  }

  // Auth button event
  document.getElementById("auth-button").addEventListener("click", handleAuthClick);
  dom.swanToggle?.addEventListener("click", toggleSwan);

  // Login modal events
  dom.submitLogin.addEventListener("click", () => {
    const username = dom.usernameInput.value.trim();
    const password = dom.passwordInput.value;
    if (username && password) {
      login(username, password);
    }
  });

  dom.cancelLogin.addEventListener("click", () => {
    dom.loginModal.classList.add("hidden");
    dom.usernameInput.value = "";
    dom.passwordInput.value = "";
  });

  dom.closeLogin.addEventListener("click", () => {
    dom.loginModal.classList.add("hidden");
  });
}

// ===== SWAN =====
function getSwanFindingsForTarget(targetType, targetId) {
  const panels = swanState.projections.panels?.data;
  if (!panels || !targetId) return [];

  switch (targetType) {
    case "object":
      return panels.objects?.[targetId] || [];
    case "alert":
      return panels.alerts?.[targetId] || [];
    case "incident":
      return panels.incidents?.[targetId] || [];
    default:
      return [];
  }
}

function renderSwanInsights(targetType, targetId) {
  const findings = getSwanFindingsForTarget(targetType, targetId);
  if (!findings || findings.length === 0) {
    return "";
  }

  return `
    <div class="swan-insights">
      <div class="swan-insights-title">SWAN INSIGHTS</div>
      ${findings
        .map(
          (finding) => `
            <div class="swan-insight-item">
              <div class="swan-insight-head">
                <div class="swan-insight-title">${finding.title}</div>
                <div class="swan-insight-verification">${finding.verification_status.replace("_", " ")}</div>
              </div>
              <div class="swan-insight-summary">${finding.summary}</div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function refreshSwanDetailsForCurrentContext() {
  if (selectedObjectId) {
    const state =
      currentMode === "live" ? latestStates.get(selectedObjectId) : getCurrentReplayState();
    if (state) {
      updateInspectorFromState(selectedObjectId, state);
    }
  }

  if (incidentState.currentIncident) {
    renderIncidentPanel();
  }

  if (currentAlertId && dom.alertModal && !dom.alertModal.classList.contains("hidden")) {
    showAlertDetail(currentAlertId, { emitActivity: false }).catch((error) => {
      console.error("Failed to refresh Swan alert detail:", error);
    });
  }
}

async function fetchSwanArtifact(artifactKey) {
  if (!swanState.session?.session_id || !sessionState.isAuthenticated) {
    return null;
  }

  const response = await fetch(
    `${apiBaseUrl}/swan/artifacts/${swanState.session.session_id}/${artifactKey}`,
    {
      headers: getSwanHeaders(),
    },
  );

  if (handleUnauthorized(response) || !response.ok) {
    return null;
  }

  return response.json();
}

function handleSwanProjectionData(artifactKey, data) {
  if (!data) return;

  if (artifactKey === "session") {
    swanState.projections.session = data;
  } else if (artifactKey === "panels") {
    swanState.projections.panels = data;
    refreshSwanDetailsForCurrentContext();
  } else if (artifactKey === "map") {
    swanState.projections.map = data;
    renderSwanMapOverlays();
  } else if (artifactKey === "notifications") {
    swanState.projections.notifications = data;
    for (const item of data.data?.items || []) {
      showSwanToast(item);
    }
  }

  updateSwanUI();
}

async function refreshSwanProjections() {
  if (!swanState.session) return;

  const [sessionProjection, panelsProjection, mapProjection, notificationsProjection] =
    await Promise.all([
      fetchSwanArtifact("session"),
      fetchSwanArtifact("panels"),
      fetchSwanArtifact("map"),
      fetchSwanArtifact("notifications"),
    ]);

  handleSwanProjectionData("session", sessionProjection);
  handleSwanProjectionData("panels", panelsProjection);
  handleSwanProjectionData("map", mapProjection);
  handleSwanProjectionData("notifications", notificationsProjection);
}

async function hydrateSwanSession() {
  const syncToken = ++swanState.syncToken;

  if (!sessionState.isAuthenticated) {
    if (syncToken !== swanState.syncToken) {
      return;
    }
    swanState.enabled = false;
    swanState.session = null;
    swanState.projections = { session: null, panels: null, map: null, notifications: null };
    clearSwanOverlayEntities();
    updateSwanUI();
    return;
  }

  const response = await fetch(`${apiBaseUrl}/swan/session`, {
    headers: getSwanHeaders(),
  }).catch(() => null);

  if (!response || handleUnauthorized(response) || !response.ok) {
    if (syncToken !== swanState.syncToken) {
      return;
    }
    swanState.enabled = false;
    swanState.session = null;
    updateSwanUI();
    return;
  }

  const payload = await response.json();
  if (syncToken !== swanState.syncToken) {
    return;
  }
  if (!payload?.session) {
    swanState.enabled = false;
    swanState.session = null;
    swanState.projections = { session: null, panels: null, map: null, notifications: null };
    clearSwanOverlayEntities();
    updateSwanUI();
    return;
  }

  swanState.enabled = true;
  swanState.session = payload.session;
  if (payload.projections) {
    swanState.projections = payload.projections;
  }
  await refreshSwanProjections();
  if (syncToken !== swanState.syncToken) {
    return;
  }
  if (!eventSource) {
    connectToLiveEvents();
  }
  updateSwanUI();
}

async function enableSwan() {
  const syncToken = ++swanState.syncToken;

  if (!sessionState.isAuthenticated) {
    showAuthModal();
    return;
  }

  const response = await fetch(`${apiBaseUrl}/swan/session`, {
    method: "POST",
    headers: getSwanHeaders(),
    body: JSON.stringify({
      client_session_id: getSwanClientSessionId(),
      route: window.location.pathname,
      mode: currentMode,
      context: {
        selected_object_id: selectedObjectId,
        active_layers: Object.entries(layerState)
          .filter(([, enabled]) => enabled)
          .map(([layerId]) => layerId),
      },
    }),
  });

  if (handleUnauthorized(response) || !response.ok) {
    return;
  }

  const payload = await response.json();
  if (syncToken !== swanState.syncToken) {
    return;
  }
  swanState.enabled = true;
  swanState.session = payload.session;
  swanState.projections = payload.projections || swanState.projections;
  await refreshSwanProjections();
  if (syncToken !== swanState.syncToken) {
    return;
  }
  if (!eventSource) {
    connectToLiveEvents();
  }
  updateSwanUI();
}

async function disableSwan() {
  const syncToken = ++swanState.syncToken;

  if (!sessionState.isAuthenticated) {
    if (syncToken !== swanState.syncToken) {
      return;
    }
    swanState.enabled = false;
    swanState.session = null;
    updateSwanUI();
    return;
  }

  await fetch(`${apiBaseUrl}/swan/session`, {
    method: "DELETE",
    headers: getSwanHeaders(),
  }).catch(() => {});

  if (syncToken !== swanState.syncToken) {
    return;
  }
  swanState.enabled = false;
  swanState.session = null;
  swanState.projections = { session: null, panels: null, map: null, notifications: null };
  clearSwanOverlayEntities();
  if (currentMode !== "live") {
    disconnectFromLiveEvents();
  }
  updateSwanUI();
}

function toggleSwan() {
  if (swanState.enabled) {
    disableSwan();
  } else {
    enableSwan();
  }
}

function emitSwanActivity(activityType, options = {}) {
  if (!swanState.enabled || !swanState.session || !sessionState.isAuthenticated) {
    return;
  }

  const activityKey =
    options.activityKey ||
    `${activityType}:${options.targetType || "none"}:${options.targetId || "none"}`;
  const existingTimeout = swanState.pendingActivities.get(activityKey);
  if (existingTimeout) {
    window.clearTimeout(existingTimeout);
  }

  const timeoutId = window.setTimeout(async () => {
    swanState.pendingActivities.delete(activityKey);
    try {
      const response = await fetch(`${apiBaseUrl}/swan/activity`, {
        method: "POST",
        headers: getSwanHeaders(),
        body: JSON.stringify({
          client_session_id: getSwanClientSessionId(),
          activity_type: activityType,
          target_type: options.targetType || null,
          target_id: options.targetId || null,
          route: window.location.pathname,
          mode: currentMode,
          context: {
            ...(options.context || {}),
            activity_key: activityKey,
          },
        }),
      });

      if (handleUnauthorized(response) || !response.ok) {
        return;
      }

      await response.json();
    } catch (error) {
      console.error("Failed to emit Swan activity:", error);
    }
  }, 200);

  swanState.pendingActivities.set(activityKey, timeoutId);
}

// ===== CESIUM / MAP FUNCTIONS =====
function cartesianFromLatLon(lat, lon, height = 0) {
  return Cesium.Cartesian3.fromDegrees(lon, lat, height);
}

function focusOnState(state, height = 2500) {
  if (!viewer || !state?.position) {
    return;
  }

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(state.position.lon, state.position.lat, height),
    duration: 1,
  });
}

function focusOnLiveStates(states) {
  if (!viewer || !Array.isArray(states) || states.length === 0) {
    return;
  }

  if (states.length > 25) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(10, 20, 22000000),
      duration: 1,
    });
    return;
  }

  focusOnState(states[0], 2500000);
}

function clearSatelliteOrbit() {
  if (!viewer || !satelliteOrbitEntity) {
    return;
  }

  viewer.entities.remove(satelliteOrbitEntity);
  satelliteOrbitEntity = null;
}

function renderSatelliteOrbit(event) {
  clearSatelliteOrbit();
  if (!viewer || !event?.payload?.orbit_path || event.payload.orbit_path.length < 2) {
    return;
  }

  const positions = event.payload.orbit_path
    .map((point) => {
      if (typeof point?.lat !== "number" || typeof point?.lon !== "number") {
        return null;
      }
      return Cesium.Cartesian3.fromDegrees(point.lon, point.lat, point.altitude_m || 0);
    })
    .filter(Boolean);

  if (positions.length < 2) {
    return;
  }

  satelliteOrbitEntity = viewer.entities.add({
    polyline: {
      positions,
      width: 2,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.15,
        color: Cesium.Color.fromCssColorString("#60a5fa").withAlpha(0.9),
      }),
    },
  });
}

function buildFlightLabel(state) {
  const callsign =
    state?.attributes?.callsign || state?.attributes?.display_name || state?.object_id || "FLIGHT";
  const altitude = state?.position?.altitude_m;
  const heading = state?.velocity?.heading_deg;
  const altitudeText =
    typeof altitude === "number"
      ? `${Math.round(altitude / 0.3048).toLocaleString()} ft`
      : "ALT --";
  const headingText = typeof heading === "number" ? `${Math.round(heading)}°` : "--";
  return `${callsign}\n${altitudeText}  HDG ${headingText}`;
}

function formatRelativeAge(timestamp) {
  if (!timestamp) {
    return "--";
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return "--";
  }

  const ageSeconds = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 1000));
  if (ageSeconds < 60) {
    return `${ageSeconds}s ago`;
  }
  if (ageSeconds < 3600) {
    return `${Math.round(ageSeconds / 60)}m ago`;
  }
  return `${Math.round(ageSeconds / 3600)}h ago`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clearEntityMap(entityMap) {
  if (!viewer) {
    entityMap?.clear?.();
    return;
  }

  for (const [, entity] of entityMap || []) {
    viewer.entities.remove(entity);
  }

  entityMap?.clear?.();
}

function extractCoordinatePairs(value, pairs = []) {
  if (!Array.isArray(value)) {
    return pairs;
  }

  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  ) {
    pairs.push([value[0], value[1]]);
    return pairs;
  }

  for (const entry of value) {
    extractCoordinatePairs(entry, pairs);
  }
  return pairs;
}

function getAoiCoordinatePairs(aoi) {
  return extractCoordinatePairs(aoi?.coordinates, []);
}

function focusMapOnLocation(lat, lon, height = 12000) {
  if (!viewer || typeof Cesium === "undefined") {
    return;
  }

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
    duration: 1.3,
  });
}

function getExternalLayerEventKey(event) {
  return String(event?.external_id || event?.event_id || "");
}

function getExternalLayerBoundsQuery() {
  if (!viewer || typeof Cesium === "undefined") {
    return "";
  }

  const rectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid);
  if (!rectangle) {
    return "";
  }

  const west = Cesium.Math.toDegrees(rectangle.west);
  const south = Cesium.Math.toDegrees(rectangle.south);
  const east = Cesium.Math.toDegrees(rectangle.east);
  const north = Cesium.Math.toDegrees(rectangle.north);

  if ([west, south, east, north].some((value) => !Number.isFinite(value))) {
    return "";
  }

  // Skip wraparound rectangles for now and fall back to global fetch.
  if (east < west) {
    return "";
  }

  const params = new URLSearchParams({
    west: west.toFixed(4),
    south: south.toFixed(4),
    east: east.toFixed(4),
    north: north.toFixed(4),
  });

  return `?${params.toString()}`;
}

function getExternalLayerBoundsSignature() {
  return getExternalLayerBoundsQuery();
}

function scheduleViewportExternalLayerReload() {
  if (externalLayerViewportReloadTimer) {
    clearTimeout(externalLayerViewportReloadTimer);
  }

  externalLayerViewportReloadTimer = setTimeout(() => {
    externalLayerViewportReloadTimer = null;
    for (const [layerId, layer] of externalLayerState.layers) {
      if (!layer.enabled) {
        continue;
      }
      void queueExternalLayerReload(layerId);
    }

    const nextBoundsSignature = getExternalLayerBoundsSignature();
    if (
      nextBoundsSignature !== liveEventsBoundsSignature &&
      (currentMode === "live" || swanState.enabled)
    ) {
      connectToLiveEvents();
    }
  }, 350);
}

function getSparseLabelStride(stateCount) {
  if (visualState.detect) {
    return 1;
  }

  if (visualState.panoptic) {
    return Math.max(2, Math.ceil(stateCount / 250));
  }

  return Math.max(6, Math.ceil(stateCount / 90));
}

function buildProjectedTrackPoints(state) {
  if (!state?.position) {
    return [];
  }

  const headingDeg = state.velocity?.heading_deg;
  const speedMps = state.velocity?.speed_mps;
  if (typeof headingDeg !== "number" || typeof speedMps !== "number" || speedMps <= 0) {
    return [
      cartesianFromLatLon(state.position.lat, state.position.lon, state.position.altitude_m || 0),
    ];
  }

  const earthRadiusM = 6378137;
  const latRad = Cesium.Math.toRadians(state.position.lat);
  const lonRad = Cesium.Math.toRadians(state.position.lon);
  const headingRad = Cesium.Math.toRadians(headingDeg);
  const distanceM = Math.min(speedMps * 600, 250000);
  const angularDistance = distanceM / earthRadiusM;

  const targetLat = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(headingRad),
  );
  const targetLon =
    lonRad +
    Math.atan2(
      Math.sin(headingRad) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(targetLat),
    );

  return [
    cartesianFromLatLon(state.position.lat, state.position.lon, state.position.altitude_m || 0),
    Cesium.Cartesian3.fromDegrees(
      Cesium.Math.toDegrees(targetLon),
      Cesium.Math.toDegrees(targetLat),
      state.position.altitude_m || 0,
    ),
  ];
}

function updateFlightsLayerMeta(payload) {
  liveFlightsMeta.count = payload?.states?.length || 0;
  liveFlightsMeta.generatedAt = payload?.generated_at || null;
  dom.flightsCount.textContent = `${liveFlightsMeta.count.toLocaleString()} LIVE`;
  dom.flightsUpdate.textContent = formatRelativeAge(liveFlightsMeta.generatedAt);
}

function buildFlightEntitySpec(objectId, state, showLabel) {
  const isSelected = selectedObjectId === objectId;
  const altitude = state.position?.altitude_m || 0;
  let color =
    state.status === "ground"
      ? Cesium.Color.fromCssColorString("#f59e0b")
      : Cesium.Color.fromCssColorString("#38bdf8");

  if (visualState.preset === "nvg") {
    color = Cesium.Color.fromCssColorString("#39ff14");
  } else if (visualState.preset === "flir") {
    color = Cesium.Color.fromCssColorString(isSelected ? "#ff6b35" : "#ffaa00");
  }

  const outlineColor = isSelected
    ? Cesium.Color.fromCssColorString("#ffffff")
    : Cesium.Color.fromCssColorString("#1b1b18");

  return {
    position: cartesianFromLatLon(state.position.lat, state.position.lon, altitude),
    point: {
      pixelSize: isSelected ? 11 : 6,
      color: color,
      outlineColor: outlineColor,
      outlineWidth: isSelected ? 2 : 1,
    },
    label: {
      text: buildFlightLabel(state),
      show: showLabel,
      font: "10px monospace",
      fillColor: color,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -16),
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
        0,
        visualState.detect ? 20_000_000 : 2_500_000,
      ),
    },
  };
}

function upsertLiveFlightEntity(objectId, state, showLabel) {
  const spec = buildFlightEntitySpec(objectId, state, showLabel);
  const existing = objectEntities.get(objectId);

  if (existing) {
    existing.position = spec.position;
    existing.point = spec.point;
    existing.ellipse = undefined;
    existing.label = spec.label;
    existing.properties = {
      objectId: objectId,
      state: state,
    };
    return existing;
  }

  const entity = viewer.entities.add({
    ...spec,
    properties: {
      objectId: objectId,
      state: state,
    },
  });
  objectEntities.set(objectId, entity);
  return entity;
}

function refreshFreshnessDisplays() {
  dom.flightsUpdate.textContent = formatRelativeAge(liveFlightsMeta.generatedAt);
  updateLayerRailUI();
}

function initCesium() {
  console.log("Initializing Cesium... Cesium defined:", typeof Cesium !== "undefined");

  const container = document.getElementById("cesiumContainer");
  if (!container) {
    console.error("Cesium container not found!");
    return;
  }

  if (typeof Cesium === "undefined") {
    console.warn("Cesium not loaded - showing fallback map message");
    container.innerHTML =
      '<div style="padding: 40px; text-align: center; color: #00ff41; background: #111; height: 100%;"><h2>TACTICAL MAP</h2><p>Map bundle did not load.</p><p style="color: #666;">Refresh after the local Cesium assets are available.</p></div>';
    return;
  }

  configureCesiumCredentials();

  viewer = new Cesium.Viewer("cesiumContainer", {
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    baseLayer: Cesium.ImageryLayer.fromProviderAsync(
      createBaseImageryProvider(visualState.mapSurface),
    ),
    sceneMode: Cesium.SceneMode.SCENE3D,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: true,
    sceneModePicker: true,
    navigationHelpButton: true,
    animation: false,
    timeline: false,
    fullscreenButton: false,
  });

  // Set initial view to full globe
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000),
  });

  updateMapSurfaceControls();

  viewer.camera.moveEnd.addEventListener(() => {
    scheduleViewportExternalLayerReload();
  });

  // Handle object selection
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((click) => {
    const pickedObject = viewer.scene.pick(click.position);
    if (Cesium.defined(pickedObject) && pickedObject.id?.properties) {
      const swanFindingId = pickedObject.id.properties.swanFindingId?.getValue?.();
      if (swanFindingId) {
        handleSwanFindingSelection(swanFindingId);
        return;
      }
      const objectId = pickedObject.id.properties.objectId?.getValue?.();
      if (objectId) {
        selectedSatelliteId = null;
        clearSatelliteOrbit();
        selectObject(objectId);
        return;
      }

      const layerEvent = pickedObject.id.properties.event?.getValue?.(Cesium.JulianDate.now());
      if (layerEvent?.payload?.noradId || layerEvent?.payload?.orbit_path) {
        selectedObjectId = null;
        selectedSatelliteId = layerEvent.external_id || layerEvent.payload?.noradId || null;
        renderSatelliteOrbit(layerEvent);
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(
            layerEvent.lon,
            layerEvent.lat,
            Math.max(layerEvent.altitude_m || 450000, 250000),
          ),
          duration: 1,
        });
        dom.inspectorContent.innerHTML = `
          <div class="inspector-field">
            <span class="inspector-label">Satellite</span>
            <span class="inspector-value">${layerEvent.payload?.name || layerEvent.external_id}</span>
          </div>
          <div class="inspector-field">
            <span class="inspector-label">NORAD</span>
            <span class="inspector-value">${layerEvent.payload?.noradId || layerEvent.external_id}</span>
          </div>
          <div class="inspector-field">
            <span class="inspector-label">Orbit</span>
            <span class="inspector-value">${layerEvent.payload?.type || "unknown"}</span>
          </div>
          <div class="inspector-field">
            <span class="inspector-label">Altitude</span>
            <span class="inspector-value">${layerEvent.altitude_m ? `${Math.round(layerEvent.altitude_m / 1000).toLocaleString()} km` : "--"}</span>
          </div>
          <div class="inspector-field">
            <span class="inspector-label">Velocity</span>
            <span class="inspector-value">${layerEvent.payload?.velocity ? `${layerEvent.payload.velocity.toFixed(2)} km/s` : "--"}</span>
          </div>
        `;
        return;
      }
    }

    const cartesian = viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
    if (!cartesian) {
      return;
    }

    const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
    emitSwanActivity("map_selection_changed", {
      targetType: "map_selection",
      targetId: `${Cesium.Math.toDegrees(cartographic.latitude).toFixed(4)},${Cesium.Math.toDegrees(cartographic.longitude).toFixed(4)}`,
      context: {
        lat: Cesium.Math.toDegrees(cartographic.latitude),
        lon: Cesium.Math.toDegrees(cartographic.longitude),
      },
    });
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  // Update coordinates display
  viewer.camera.changed.addEventListener(() => {
    const cartographic = viewer.camera.positionCartographic;
    const lat = Cesium.Math.toDegrees(cartographic.latitude).toFixed(4);
    const lon = Cesium.Math.toDegrees(cartographic.longitude).toFixed(4);
    dom.coordinates.textContent = `${lat}, ${lon}`;

    // Approximate zoom level
    const height = cartographic.height;
    const zoom = Math.max(1, Math.min(20, Math.round(20 - Math.log2(height / 100))));
    dom.zoomLevel.textContent = `ZOOM: ${zoom}`;
  });

  renderSwanMapOverlays();
}

function renderMapMarkers() {
  if (!viewer || typeof Cesium === "undefined") return;

  // Only render if flights layer is enabled
  if (!layerState.flights) {
    for (const entity of objectEntities.values()) {
      viewer.entities.remove(entity);
    }
    objectEntities.clear();
    return;
  }

  if (currentMode === "live") {
    const sparseStride = getSparseLabelStride(latestStates.size || 1);
    const renderedIds = new Set();
    let index = 0;

    for (const [objectId, state] of latestStates) {
      if (!state.position) continue;
      const isSelected = selectedObjectId === objectId;
      const showLabel = isSelected || index % sparseStride === 0;
      upsertLiveFlightEntity(objectId, state, showLabel);
      renderedIds.add(objectId);
      index += 1;
    }

    for (const [objectId, entity] of objectEntities) {
      if (renderedIds.has(objectId)) {
        continue;
      }
      viewer.entities.remove(entity);
      objectEntities.delete(objectId);
    }
    return;
  }

  for (const entity of objectEntities.values()) {
    viewer.entities.remove(entity);
  }
  objectEntities.clear();

  const states = currentMode === "live" ? latestStates : getReplayStatesAtCurrentIndex();
  const sparseStride = getSparseLabelStride(states.size || 1);
  let index = 0;

  for (const [objectId, state] of states) {
    if (!state.position) continue;

    const isSelected = selectedObjectId === objectId;
    const showLabel = currentMode === "live" && (isSelected || index % sparseStride === 0);
    const altitude = currentMode === "live" ? state.position.altitude_m || 0 : 0;
    let color;
    if (currentMode === "live") {
      color =
        state.status === "ground"
          ? Cesium.Color.fromCssColorString("#f59e0b")
          : Cesium.Color.fromCssColorString("#38bdf8");
    } else {
      color = Cesium.Color.fromCssColorString("#f3d27a");
    }

    if (visualState.preset === "nvg") {
      color = Cesium.Color.fromCssColorString("#39ff14");
    } else if (visualState.preset === "flir") {
      color = Cesium.Color.fromCssColorString(isSelected ? "#ff6b35" : "#ffaa00");
    }

    const outlineColor = isSelected
      ? Cesium.Color.fromCssColorString("#ffffff")
      : Cesium.Color.fromCssColorString("#1b1b18");

    const entity = viewer.entities.add({
      position: cartesianFromLatLon(state.position.lat, state.position.lon, altitude),
      point:
        currentMode === "live"
          ? {
              pixelSize: isSelected ? 11 : 6,
              color: color,
              outlineColor: outlineColor,
              outlineWidth: isSelected ? 2 : 1,
            }
          : undefined,
      ellipse:
        currentMode === "live"
          ? undefined
          : {
              semiMinorAxis: isSelected ? 25 : 20,
              semiMajorAxis: isSelected ? 25 : 20,
              material: color,
              outline: true,
              outlineColor: outlineColor,
              outlineWidth: isSelected ? 4 : 2,
            },
      label:
        currentMode === "live"
          ? {
              text: buildFlightLabel(state),
              show: showLabel,
              font: "10px monospace",
              fillColor: color,
              outlineColor: Cesium.Color.BLACK,
              outlineWidth: 2,
              style: Cesium.LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              pixelOffset: new Cesium.Cartesian2(0, -16),
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
                0,
                visualState.detect ? 20_000_000 : 2_500_000,
              ),
            }
          : undefined,
      properties: {
        objectId: objectId,
      },
    });

    objectEntities.set(objectId, entity);
    index += 1;
  }
}

function getReplayStatesAtCurrentIndex() {
  const states = new Map();
  if (replayState.items.length === 0) return states;

  for (let i = 0; i <= replayState.currentIndex; i++) {
    const item = replayState.items[i];
    if (item?.state_after_event) {
      states.set(item.event.object_id, item.state_after_event);
    }
  }
  return states;
}

function renderTrack() {
  if (!viewer || typeof Cesium === "undefined") return;

  if (trackEntity) {
    viewer.entities.remove(trackEntity);
    trackEntity = null;
  }

  if (!layerState.flights) return;
  if (replayState.items.length === 0 && currentMode === "replay") return;

  const objectId = dom.objectId.value.trim() || "veh_42";
  const trackPoints = [];

  if (currentMode === "replay") {
    for (let i = 0; i <= replayState.currentIndex; i++) {
      const item = replayState.items[i];
      if (!item || item.event.object_id !== objectId) continue;
      const pos = item.state_after_event?.position;
      if (pos) trackPoints.push(cartesianFromLatLon(pos.lat, pos.lon));
    }
  } else {
    const history = liveTrackHistory.get(objectId) || [];
    if (history.length >= 2) {
      for (const point of history) {
        trackPoints.push(cartesianFromLatLon(point.lat, point.lon, point.altitude_m || 0));
      }
    } else {
      const state = latestStates.get(objectId);
      if (state?.position) {
        trackPoints.push(...buildProjectedTrackPoints(state));
      }
    }
  }

  if (trackPoints.length < 2) return;

  let trackColor =
    currentMode === "live"
      ? Cesium.Color.fromCssColorString("#00ff41")
      : Cesium.Color.fromCssColorString("#745c2a");

  if (visualState.preset === "nvg") {
    trackColor = Cesium.Color.fromCssColorString("#39ff14");
  } else if (visualState.preset === "flir") {
    trackColor = Cesium.Color.fromCssColorString("#ff6b35");
  }

  trackEntity = viewer.entities.add({
    polyline: {
      positions: trackPoints,
      width: 3,
      material: new Cesium.PolylineDashMaterialProperty({
        color: trackColor,
      }),
    },
  });
}

function selectObject(objectId) {
  selectedObjectId = objectId;
  selectedSatelliteId = null;
  clearSatelliteOrbit();
  const state = currentMode === "live" ? latestStates.get(objectId) : getCurrentReplayState();
  if (state) {
    updateInspectorFromState(objectId, state);
    updateCCTVSection(objectId, state);
  }
  if (currentMode === "live") {
    void loadLiveTrack(objectId);
  }
  renderMapMarkers();
  emitSwanActivity("object_selected", {
    targetType: "object",
    targetId: objectId,
    context: {
      selected_object_id: objectId,
      selected_mode: currentMode,
    },
  });
}

function getCurrentReplayState() {
  if (replayState.items.length === 0) return null;
  const safeIndex = Math.min(replayState.currentIndex, replayState.items.length - 1);
  return replayState.items[safeIndex]?.state_after_event;
}

// ===== INSPECTOR =====
function updateInspectorFromState(objectId, state) {
  let html = `
    <div class="inspector-field">
      <span class="inspector-label">Object ID</span>
      <span class="inspector-value">${objectId}</span>
    </div>
  `;

  if (state) {
    const displayName =
      state.attributes?.callsign || state.attributes?.display_name || state.object_id || objectId;
    html += `
      <div class="inspector-field">
        <span class="inspector-label">Callsign</span>
        <span class="inspector-value">${displayName}</span>
      </div>
    `;

    html += `
      <div class="inspector-field">
        <span class="inspector-label">As Of</span>
        <span class="inspector-value">${state.as_of || "--"}</span>
      </div>
    `;

    if (state.position) {
      html += `
        <div class="inspector-field">
          <span class="inspector-label">Position</span>
          <span class="inspector-value">${state.position.lat.toFixed(6)}, ${state.position.lon.toFixed(6)}</span>
        </div>
      `;

      if (typeof state.position.altitude_m === "number") {
        html += `
          <div class="inspector-field">
            <span class="inspector-label">Altitude</span>
            <span class="inspector-value">${Math.round(state.position.altitude_m / 0.3048).toLocaleString()} ft</span>
          </div>
        `;
      }
    }

    if (state.velocity) {
      html += `
        <div class="inspector-field">
          <span class="inspector-label">Velocity</span>
          <span class="inspector-value">
            ${state.velocity.speed_mps ? `${state.velocity.speed_mps.toFixed(1)} m/s` : "N/A"}
            ${state.velocity.heading_deg ? `${state.velocity.heading_deg.toFixed(1)}°` : ""}
          </span>
        </div>
      `;
    }

    if (state.status) {
      html += `
        <div class="inspector-field">
          <span class="inspector-label">Status</span>
          <span class="inspector-value">${state.status}</span>
        </div>
      `;
    }

    if (state.source_id) {
      html += `
        <div class="inspector-field">
          <span class="inspector-label">Source</span>
          <span class="inspector-value">${state.source_id}</span>
        </div>
      `;
    }

    if (state.attributes?.origin_country) {
      html += `
        <div class="inspector-field">
          <span class="inspector-label">Origin</span>
          <span class="inspector-value">${state.attributes.origin_country}</span>
        </div>
      `;
    }

    if (state.last_event_id) {
      html += `
        <div class="inspector-field">
          <span class="inspector-label">Last Event</span>
          <span class="inspector-value">${state.last_event_id}</span>
        </div>
      `;
    }
  }

  const groundViewDisabled = !state?.position || !isStreetSceneConfigured();
  const groundViewHint = !state?.position
    ? "Select a positioned object"
    : !isStreetSceneConfigured()
      ? "Set STREET_SCENE_PROVIDER to enable"
      : visualState.streetSceneStatus === "error"
        ? "Scene layer failed to load"
        : visualState.streetSceneReady
          ? "Street scene ready"
          : "Load close-range scene";

  html += `
    <div class="inspector-ground-view">
      <div class="inspector-ground-view-meta">
        <span class="inspector-label">Ground View</span>
        <span class="inspector-ground-view-status">${getStreetSceneStatusLabel()}</span>
      </div>
      <button
        type="button"
        id="inspector-ground-view"
        class="inspector-ground-view-button"
        ${groundViewDisabled ? "disabled" : ""}
      >
        ENTER GROUND VIEW
      </button>
      <div class="inspector-ground-view-hint">${groundViewHint}</div>
    </div>
  `;

  html += renderSwanInsights("object", objectId);
  dom.inspectorContent.innerHTML = html;
  bindInspectorActions(state);
}

// ===== CCTV / SOURCE PANEL SECTION =====
function renderCCTVPlaceholder(title, hint) {
  dom.cctvContent.innerHTML = `
    <div class="cctv-placeholder">
      <div class="placeholder-icon">📷</div>
      <div class="placeholder-text">${title}</div>
      <div class="placeholder-hint">${hint}</div>
    </div>
  `;
}

async function updateCCTVSection(objectId, state) {
  // Check if CCTV layer is enabled
  if (!layerState.cctv) {
    renderCCTVPlaceholder("CCTV layer disabled", "Enable CCTV Mesh layer to view camera data");
    return;
  }

  // Try to get real source context from source registry
  try {
    // First, check for explicit links to this object
    const linksResponse = await fetch(`${apiBaseUrl}/sources/linked/object/${objectId}`);
    const linksData = await linksResponse.json();

    if (linksData.links && linksData.links.length > 0) {
      // Show linked sources
      const linkedSources = [];
      for (const link of linksData.links) {
        const sourceResponse = await fetch(`${apiBaseUrl}/sources/${link.source_id}`);
        if (sourceResponse.ok) {
          const source = await sourceResponse.json();
          linkedSources.push(source);
        }
      }

      if (linkedSources.length > 0) {
        await renderSourcePanel(linkedSources);
        return;
      }
    }

    // Fall back to nearest source if position available
    if (state?.position?.lat && state?.position?.lon) {
      const nearestResponse = await fetch(
        `${apiBaseUrl}/sources/nearest-to-point?lat=${state.position.lat}&lon=${state.position.lon}`,
      );

      if (nearestResponse.ok) {
        const nearestSource = await nearestResponse.json();
        await renderSourcePanel([nearestSource], true);
        return;
      }
    }
  } catch (e) {
    console.warn("Source registry not available, using legacy method:", e);
  }

  // Legacy fallback - original logic
  const hasCameraSource = state?.source_id?.includes("camera") || state?.source_id?.includes("cam");
  const isCameraObject = objectId.includes("camera") || objectId.includes("cam");

  if (hasCameraSource || isCameraObject) {
    const sourceId = state?.source_id || objectId;
    dom.cctvContent.innerHTML = `
      <div class="cctv-info">
        <div class="cctv-source">SOURCE: ${sourceId}</div>
        <div class="cctv-status">Status: SNAPSHOT ONLY</div>
      </div>
      <div class="cctv-placeholder">
        <div class="placeholder-icon">📷</div>
        <div class="placeholder-text">NO LIVE VIEW AVAILABLE</div>
        <div class="placeholder-hint">Camera snapshots only - no real-time video stream</div>
        <div class="placeholder-hint" style="margin-top: 8px; color: var(--accent-primary);">
          Nearest source: ${sourceId}
        </div>
        <div class="placeholder-hint" style="margin-top: 4px;">
          Last update: ${state?.as_of || "Unknown"}
        </div>
      </div>
    `;
  } else {
    dom.cctvContent.innerHTML = `
      <div class="cctv-placeholder">
        <div class="placeholder-icon">📷</div>
        <div class="placeholder-text">NO CAMERA ASSOCIATED</div>
        <div class="placeholder-hint">Selected object has no linked camera source</div>
        ${
          state?.source_id
            ? `
          <div class="placeholder-hint" style="margin-top: 8px; color: var(--accent-primary);">
            Nearest source: ${state.source_id}
          </div>
        `
            : ""
        }
      </div>
    `;
  }
}

async function renderSourcePanel(sources, isNearest = false) {
  const source = sources[0]; // Primary source
  const statusClass =
    source.status === "active"
      ? "status-active"
      : source.status === "error"
        ? "status-error"
        : "status-inactive";

  const statusText =
    source.status === "active" ? "Active" : source.status === "error" ? "Error" : "Inactive";

  const liveStatus = source.live_available
    ? '<span class="status-live">LIVE AVAILABLE</span>'
    : '<span class="status-unavailable">NO LIVE VIEW</span>';

  const snapshotStatus = source.snapshot_available
    ? '<span class="status-available">SNAPSHOT AVAILABLE</span>'
    : '<span class="status-unavailable">NO SNAPSHOT</span>';

  let linkedInfo = "";
  if (isNearest) {
    linkedInfo = `<div class="source-info-link-type">Nearest source (${Math.round(source.distance_m || 0)}m)</div>`;
  } else {
    linkedInfo = `<div class="source-info-link-type">Explicitly linked source</div>`;
  }

  // Build additional sources list if there are more
  let additionalSources = "";
  if (sources.length > 1) {
    additionalSources = `<div class="source-additional-title">Other linked sources:</div>`;
    for (let i = 1; i < sources.length; i++) {
      const s = sources[i];
      additionalSources += `<div class="source-additional-item">${s.label || s.source_id}</div>`;
    }
  }

  dom.cctvContent.innerHTML = `
    <div class="source-panel">
      <div class="source-info-header">
        <div class="source-id">${source.source_id}</div>
        <div class="source-label">${source.label || "Unknown Source"}</div>
      </div>
      <div class="source-info-grid">
        <div class="source-info-item">
          <div class="source-info-label">Provider</div>
          <div class="source-info-value">${source.provider || "Unknown"}</div>
        </div>
        <div class="source-info-item">
          <div class="source-info-label">Type</div>
          <div class="source-info-value">${source.source_type || "Unknown"}</div>
        </div>
        <div class="source-info-item">
          <div class="source-info-label">Status</div>
          <div class="source-info-value ${statusClass}">${statusText}</div>
        </div>
        <div class="source-info-item">
          <div class="source-info-label">Last Update</div>
          <div class="source-info-value">${new Date(source.last_update).toLocaleString()}</div>
        </div>
      </div>
      <div class="source-availability">
        <div class="source-availability-item">${liveStatus}</div>
        <div class="source-availability-item">${snapshotStatus}</div>
      </div>
      ${linkedInfo}
      ${additionalSources}
    </div>
  `;
}

// ===== REPLAY FUNCTIONS =====
function stopPlayback() {
  if (replayState.intervalId) {
    window.clearInterval(replayState.intervalId);
    replayState.intervalId = null;
  }
  replayState.isPlaying = false;
}

function renderReplay() {
  const itemCount = replayState.items.length;
  const safeIndex = Math.min(replayState.currentIndex, Math.max(itemCount - 1, 0));
  replayState.currentIndex = safeIndex;

  dom.timelineSlider.max = String(Math.max(itemCount - 1, 0));
  dom.timelineSlider.value = String(safeIndex);
  dom.timelinePosition.textContent = `EVT ${itemCount === 0 ? 0 : safeIndex + 1}/${itemCount}`;

  const currentItem = replayState.items[safeIndex];

  if (currentItem) {
    const timestamp = new Date(currentItem.event.observed_at);
    dom.replayTimestamp.textContent = timestamp.toLocaleTimeString("en-US", { hour12: false });
  } else {
    dom.replayTimestamp.textContent = "--:--:--";
  }

  dom.eventList.innerHTML = replayState.items
    .map((item, index) => {
      const isActive = index === safeIndex;
      return `
        <li class="${isActive ? "active-item" : ""}" data-index="${index}">
          ${item.sequence}. ${item.event.event_id}
        </li>
      `;
    })
    .join("");

  // Add click handlers to event list items
  dom.eventList.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", () => {
      replayState.currentIndex = parseInt(li.dataset.index, 10);
      renderReplay();
    });
  });

  renderMapMarkers();
  renderTrack();
}

async function loadReplay() {
  stopPlayback();
  updateStatus("LOADING REPLAY...");

  const requestBody = {
    start_at: dom.startAt.value.trim(),
    end_at: dom.endAt.value.trim(),
    object_id: dom.objectId.value.trim() || undefined,
  };

  try {
    const response = await fetch(`${apiBaseUrl}/replay/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const payload = await response.json();

    if (!response.ok) {
      replayState.items = [];
      replayState.currentIndex = 0;
      updateStatus(payload.message || payload.error || "REPLAY FAILED");
      renderReplay();
      return;
    }

    replayState.items = payload.items;
    replayState.currentIndex = 0;
    updateStatus(`LOADED ${payload.item_count} ITEMS`);
    renderReplay();
    emitSwanActivity("replay_query_submitted", {
      targetType: "replay_window",
      targetId: requestBody.object_id || "global",
      context: {
        replay_query: requestBody,
      },
    });

    // Show events panel
    dom.eventsPanel.classList.remove("hidden");

    if (replayState.items.length > 0) {
      const firstItem = replayState.items[0];
      if (firstItem.state_after_event?.position) {
        const pos = firstItem.state_after_event.position;
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, 1000),
          duration: 1,
        });
      }
    }
  } catch (error) {
    replayState.items = [];
    replayState.currentIndex = 0;
    updateStatus(error instanceof Error ? error.message.toUpperCase() : "LOAD FAILED");
    renderReplay();
  }
}

function stepReplay() {
  if (replayState.items.length === 0) {
    updateStatus("NO REPLAY LOADED");
    return;
  }

  replayState.currentIndex = Math.min(replayState.currentIndex + 1, replayState.items.length - 1);
  renderReplay();
}

function playReplay() {
  if (replayState.items.length === 0) {
    updateStatus("NO REPLAY LOADED");
    return;
  }

  stopPlayback();
  updateStatus("PLAYING");
  replayState.isPlaying = true;

  replayState.intervalId = window.setInterval(() => {
    if (replayState.currentIndex >= replayState.items.length - 1) {
      stopPlayback();
      updateStatus("REPLAY ENDED");
      return;
    }

    stepReplay();
  }, 1000);
}

function pauseReplay() {
  stopPlayback();
  updateStatus("PAUSED");
}

function resetReplay() {
  stopPlayback();
  replayState.currentIndex = 0;
  renderReplay();
  updateStatus("REPLAY RESET");
}

// ===== MODE SWITCHING =====
function switchToLiveMode() {
  currentMode = "live";
  hasCenteredOnLiveData = false;
  dom.modeLive.classList.add("active");
  dom.modeReplay.classList.remove("active");
  dom.modeValue.textContent = "LIVE";
  dom.modeValue.classList.add("live");

  // Hide replay-specific UI
  dom.eventsPanel.classList.add("hidden");

  updateStatus("CONNECTING TO LIVE FEED...");
  connectToLiveEvents();
  queueLiveSnapshotReload();
  loadSourceHealth();
  renderMapMarkers();
  emitSwanActivity("mode_switched", {
    targetType: "mode",
    targetId: "live",
    context: {
      mode: "live",
    },
  });
  syncStateToUrl();
}

function switchToReplayMode() {
  currentMode = "replay";
  hasCenteredOnLiveData = false;
  dom.modeLive.classList.remove("active");
  dom.modeReplay.classList.add("active");
  dom.modeValue.textContent = "REPLAY";
  dom.modeValue.classList.remove("live");

  if (!swanState.enabled) {
    disconnectFromLiveEvents();
  }
  updateStatus("REPLAY MODE");
  renderReplay();
  emitSwanActivity("mode_switched", {
    targetType: "mode",
    targetId: "replay",
    context: {
      mode: "replay",
    },
  });
  syncStateToUrl();
}

// ===== LIVE EVENTS =====
function connectToLiveEvents() {
  disconnectFromLiveEvents();
  updateConnectionStatus("connecting");

  const params = new URLSearchParams();
  if (lastSequence > 0) {
    params.set("since_sequence", String(lastSequence));
  }
  const boundsQuery = getExternalLayerBoundsQuery();
  if (boundsQuery) {
    const boundsParams = new URLSearchParams(boundsQuery.slice(1));
    for (const [key, value] of boundsParams.entries()) {
      params.set(key, value);
    }
  }
  liveEventsBoundsSignature = boundsQuery;
  const url = `${apiBaseUrl}/live/events${params.toString() ? `?${params.toString()}` : ""}`;
  eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "connection_info") {
        if (currentMode === "live" && lastSequence === 0) {
          queueLiveSnapshotReload();
        }
        updateConnectionStatus("connected");
        reconnectAttempts = 0;
        lastSequence = data.payload.server_sequence;
        if (currentMode === "live") {
          updateStatus("LIVE FEED CONNECTED");
        }
      } else if (data.type === "live_snapshot_update") {
        if (data.sequence) {
          lastSequence = data.sequence;
        }
        if (currentMode === "live") {
          updateStatus(`LIVE WORLD REFRESH ${data.payload.object_count.toLocaleString()} TARGETS`);
          queueLiveSnapshotReload();
        }
      } else if (data.type === "object_state_update") {
        if (data.sequence) {
          lastSequence = data.sequence;
        }
        if (currentMode === "live") {
          handleLiveStateUpdate(data.payload);
        }
      } else if (data.type === "external_layer_update") {
        if (data.sequence) {
          lastSequence = data.sequence;
        }
        handleExternalLayerUpdate(data.payload);
      } else if (data.type === "external_layer_snapshot_update") {
        if (data.sequence) {
          lastSequence = data.sequence;
        }
        const layer = applyExternalLayerUpdate({
          ...data.payload,
          count: data.payload.count,
          error_message: data.payload.error_message,
        });
        if (!layer) {
          return;
        }
        if (!layer.enabled || layer.status === "unavailable") {
          clearExternalLayerEntities(data.payload.layer_id);
          return;
        }
        renderExternalLayerData(data.payload.layer_id, data.payload);
      } else if (data.type === "external_layer_delta_update") {
        if (data.sequence) {
          lastSequence = data.sequence;
        }
        handleExternalLayerDeltaUpdate(data.payload);
      } else if (data.type === "incident_intelligence_update") {
        if (data.sequence) {
          lastSequence = data.sequence;
        }
        if (
          incidentState.currentIncident &&
          data.payload.incident_id === incidentState.currentIncident.incident_id
        ) {
          loadIncidentIntelligence(data.payload.incident_id).catch((error) => {
            console.error("Failed to refresh incident intelligence:", error);
          });
        }
      } else if (data.type === "swan_projection_update") {
        if (
          swanState.enabled &&
          swanState.session &&
          data.payload.session_id === swanState.session.session_id
        ) {
          fetchSwanArtifact(data.payload.artifact_key)
            .then((artifact) => handleSwanProjectionData(data.payload.artifact_key, artifact))
            .catch((error) => {
              console.error("Failed to refresh Swan projection:", error);
            });
        }
      } else if (data.type === "swan_session_update") {
        if (
          swanState.enabled &&
          swanState.session &&
          data.payload.session_id === swanState.session.session_id
        ) {
          hydrateSwanSession().catch((error) => {
            console.error("Failed to hydrate Swan session:", error);
          });
        }
      } else if (data.type === "swan_notification") {
        if (
          swanState.enabled &&
          swanState.session &&
          data.payload.session_id === swanState.session.session_id
        ) {
          showSwanToast(data.payload.notification);
          fetchSwanArtifact("notifications")
            .then((artifact) => handleSwanProjectionData("notifications", artifact))
            .catch(() => {});
        }
      } else if (data.type === "insight_published" || data.payload?.insightId) {
        handleInsightEvent(data);
      }
    } catch {
      // Ignore parse errors
    }
  };

  eventSource.onerror = () => {
    eventSource?.close();
    eventSource = null;

    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      updateConnectionStatus("reconnecting");

      const delay = Math.min(1000 * 2 ** reconnectAttempts, 30000);
      setTimeout(() => {
        if (currentMode === "live" || swanState.enabled) {
          connectToLiveEvents();
        }
      }, delay);
    } else {
      updateConnectionStatus("error", "max attempts");
      updateStatus("LIVE FEED DISCONNECTED");
    }
  };

  eventSource.onopen = () => {
    if (reconnectAttempts === 0) {
      updateConnectionStatus("connected");
    }
  };
}

function disconnectFromLiveEvents() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  liveEventsBoundsSignature = "";
  reconnectAttempts = 0;
  updateConnectionStatus("disconnected");
}

function applyExternalLayerUpdate(update) {
  if (!update?.layer_id) {
    return null;
  }

  const existing = externalLayerState.layers.get(update.layer_id);
  if (!existing) {
    return null;
  }

  const nextLayer = {
    ...existing,
    status: update.status ?? existing.status,
    count: typeof update.count === "number" ? update.count : existing.count,
    lastUpdate: update.last_update ?? existing.lastUpdate,
    errorMessage: update.error_message ?? existing.errorMessage ?? null,
  };

  externalLayerState.layers.set(update.layer_id, nextLayer);
  updateLayerRailUI();
  return nextLayer;
}

function handleExternalLayerUpdate(update) {
  const layer = applyExternalLayerUpdate(update);
  if (!layer) {
    return;
  }

  if (!layer.enabled || layer.status === "unavailable") {
    clearExternalLayerEntities(update.layer_id);
    return;
  }

  void queueExternalLayerReload(update.layer_id);
}

function handleExternalLayerDeltaUpdate(payload) {
  const layer = applyExternalLayerUpdate({
    ...payload,
    count: payload.count,
    error_message: payload.error_message,
  });
  if (!layer) {
    return;
  }

  if (!layer.enabled || layer.status === "unavailable") {
    clearExternalLayerEntities(payload.layer_id);
    externalLayerState.eventCache.set(payload.layer_id, new Map());
    return;
  }

  const cache = externalLayerState.eventCache.get(payload.layer_id) || new Map();
  for (const event of payload.upserts || []) {
    cache.set(getExternalLayerEventKey(event), event);
  }
  for (const removedId of payload.removed_external_ids || []) {
    cache.delete(String(removedId));
  }
  externalLayerState.eventCache.set(payload.layer_id, cache);

  renderExternalLayerData(payload.layer_id, {
    ...payload,
    events: Array.from(cache.values()),
  });
}

function clearSwanOverlayEntities() {
  if (!viewer || !swanState.overlayEntities) return;

  for (const entity of swanState.overlayEntities.values()) {
    viewer.entities.remove(entity);
  }
  swanState.overlayEntities.clear();
}

function renderSwanMapOverlays() {
  if (!viewer || typeof Cesium === "undefined") return;

  clearSwanOverlayEntities();
  const overlays = swanState.projections.map?.data?.overlays || [];

  for (const overlay of overlays) {
    if (typeof overlay.lat !== "number" || typeof overlay.lon !== "number") {
      continue;
    }

    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(overlay.lon, overlay.lat, 150),
      point: {
        pixelSize: 12,
        color: Cesium.Color.fromCssColorString("#00ff41").withAlpha(0.85),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: overlay.title,
        font: "10px monospace",
        fillColor: Cesium.Color.fromCssColorString("#00ff41"),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        show: false,
      },
      properties: {
        swanFindingId: overlay.finding_id,
      },
    });

    swanState.overlayEntities.set(overlay.finding_id, entity);
  }
}

function handleSwanFindingSelection(findingId) {
  const overlays = swanState.projections.map?.data?.overlays || [];
  const finding = overlays.find((item) => item.finding_id === findingId);
  if (!finding) return;

  if (finding.target_type === "object") {
    selectObject(finding.target_id);
    return;
  }

  if (finding.target_type === "alert") {
    showAlertDetail(finding.target_id);
    return;
  }

  if (finding.target_type === "incident") {
    openIncident(finding.target_id);
  }
}

function handleLiveStateUpdate(state) {
  latestStates.set(state.object_id, state);
  const existingTrack = liveTrackHistory.get(state.object_id) || [];
  const nextTrack = [
    ...existingTrack,
    {
      lat: state.position?.lat,
      lon: state.position?.lon,
      altitude_m: state.position?.altitude_m || null,
      observed_at: state.as_of,
      speed_mps: state.velocity?.speed_mps || null,
      heading_deg: state.velocity?.heading_deg || null,
    },
  ]
    .filter((point) => typeof point.lat === "number" && typeof point.lon === "number")
    .slice(-18);
  if (nextTrack.length > 0) {
    liveTrackHistory.set(state.object_id, nextTrack);
  }

  if (!hasCenteredOnLiveData && state?.position) {
    focusOnState(state);
    hasCenteredOnLiveData = true;
  }

  if (selectedObjectId === state.object_id) {
    updateInspectorFromState(state.object_id, state);
    updateCCTVSection(state.object_id, state);
  }

  if (viewer && typeof Cesium !== "undefined" && layerState.flights && state.position) {
    const sparseStride = getSparseLabelStride(latestStates.size || 1);
    const orderedIds = Array.from(latestStates.keys());
    const stateIndex = Math.max(0, orderedIds.indexOf(state.object_id));
    const showLabel = selectedObjectId === state.object_id || stateIndex % sparseStride === 0;
    upsertLiveFlightEntity(state.object_id, state, showLabel);
  } else {
    renderMapMarkers();
  }
  renderTrack();
}

async function queueLiveSnapshotReload() {
  if (!sessionState.isAuthenticated) {
    return;
  }

  if (liveSnapshotRequest) {
    pendingLiveSnapshotReload = true;
    return liveSnapshotRequest;
  }

  liveSnapshotRequest = loadLatestState().finally(async () => {
    liveSnapshotRequest = null;
    if (pendingLiveSnapshotReload) {
      pendingLiveSnapshotReload = false;
      await queueLiveSnapshotReload();
    }
  });

  return liveSnapshotRequest;
}

async function queueExternalLayerReload(layerId) {
  const layer = externalLayerState.layers.get(layerId);
  if (!layer?.enabled) {
    return;
  }

  const existingRequest = externalLayerRequests.get(layerId);
  if (existingRequest) {
    pendingExternalLayerReloads.add(layerId);
    return existingRequest;
  }

  const request = loadExternalLayerData(layerId).finally(async () => {
    externalLayerRequests.delete(layerId);
    if (pendingExternalLayerReloads.has(layerId)) {
      pendingExternalLayerReloads.delete(layerId);
      await queueExternalLayerReload(layerId);
    }
  });

  externalLayerRequests.set(layerId, request);
  return request;
}

async function loadLatestState() {
  if (!sessionState.isAuthenticated) {
    return;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/state/latest`, {
      headers: getAuthHeaders(),
    });

    if (handleUnauthorized(response) || !response.ok) {
      return;
    }

    const payload = await response.json();
    updateFlightsLayerMeta(payload);

    if (payload.states) {
      latestStates.clear();
      for (const state of payload.states) {
        latestStates.set(state.object_id, state);
      }
      if (selectedObjectId) {
        await loadLiveTrack(selectedObjectId);
      }
      renderMapMarkers();
      renderTrack();

      if (!hasCenteredOnLiveData && payload.states.length > 0) {
        focusOnLiveStates(payload.states);
        hasCenteredOnLiveData = true;
      }
    }
  } catch (error) {
    console.error("Failed to load latest state:", error);
  }
}

async function loadLiveTrack(objectId) {
  if (!sessionState.isAuthenticated || !objectId) {
    return;
  }

  try {
    const response = await fetch(
      `${apiBaseUrl}/state/tracks/${encodeURIComponent(objectId)}?limit=24`,
      {
        headers: getAuthHeaders(),
      },
    );

    if (handleUnauthorized(response) || !response.ok) {
      return;
    }

    const payload = await response.json();
    if (!Array.isArray(payload.points)) {
      return;
    }

    liveTrackHistory.set(objectId, payload.points);
    if (selectedObjectId === objectId) {
      renderTrack();
    }
  } catch (error) {
    console.error("Failed to load live track:", error);
  }
}

// ===== SOURCE HEALTH =====
async function loadSourceHealth() {
  try {
    dom.sourceList.innerHTML = '<div class="source-item loading">Loading...</div>';
    const response = await fetch(`${apiBaseUrl}/health/sources`);
    const payload = await response.json();

    if (payload.sources && payload.sources.length > 0) {
      const activeSources = payload.sources.filter((s) => s.status === "active").length;
      dom.healthIndicator.textContent = `${activeSources}/${payload.sources.length}`;

      dom.sourceList.innerHTML = payload.sources
        .map(
          (s) => `
            <div class="source-item">
              <span class="source-id">${s.source_id}</span>
              <span class="source-status ${s.status}">${s.status}</span>
            </div>
          `,
        )
        .join("");
    } else {
      dom.healthIndicator.textContent = "0/0";
      dom.sourceList.innerHTML = '<div class="source-item">No sources</div>';
    }
  } catch (error) {
    console.error("Failed to load source health:", error);
    dom.healthIndicator.textContent = "ERR";
    dom.sourceList.innerHTML = '<div class="source-item error">Failed to load</div>';
  }
}

// ===== ALERTS =====
async function loadAlerts() {
  if (!sessionState.isAuthenticated) {
    dom.alertsCount.textContent = "0";
    dom.alertsCount.classList.add("zero");
    dom.alertsListMini.innerHTML = '<span class="no-alerts">Auth required</span>';
    return;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/alerts?status=open&limit=10`, {
      headers: getAuthHeaders(),
    });

    if (handleUnauthorized(response)) {
      dom.alertsCount.textContent = "0";
      dom.alertsCount.classList.add("zero");
      dom.alertsListMini.innerHTML = '<span class="no-alerts">Auth required</span>';
      return;
    }

    const data = await response.json();

    if (data.alerts && data.alerts.length > 0) {
      dom.alertsCount.textContent = String(data.alerts.length);
      dom.alertsCount.classList.remove("zero");

      dom.alertsListMini.innerHTML = data.alerts
        .slice(0, 5)
        .map(
          (alert) => `
            <div class="alert-chip ${alert.severity}" data-alert-id="${alert.alert_id}">
              ${alert.severity}
            </div>
          `,
        )
        .join("");

      // Add click handlers
      dom.alertsListMini.querySelectorAll(".alert-chip").forEach((chip) => {
        chip.addEventListener("click", () => {
          showAlertDetail(chip.dataset.alertId);
        });
      });

      // Push critical alerts to breaking news banner
      for (const alert of data.alerts
        .filter((a) => a.severity === "critical" && a.status === "open")
        .slice(0, 3)) {
        showBreakingAlert({
          id: alert.alert_id,
          severity: alert.severity,
          title: alert.summary || "Critical Alert",
          source: "ALERTS",
          onClick: () => showAlertDetail(alert.alert_id),
        });
      }
    } else {
      dom.alertsCount.textContent = "0";
      dom.alertsCount.classList.add("zero");
      dom.alertsListMini.innerHTML = '<span class="no-alerts">No active alerts</span>';
    }
  } catch (error) {
    console.error("Failed to load alerts:", error);
    dom.alertsCount.textContent = "ERR";
    dom.alertsListMini.innerHTML = '<span class="no-alerts">Error loading</span>';
  }
}

async function loadCorrelations() {
  try {
    const response = await fetch(`${apiBaseUrl}/correlations?status=active&limit=20`, {
      headers: sessionState.token ? { Authorization: `Bearer ${sessionState.token}` } : {},
    });
    if (!response.ok) return;

    const data = await response.json();
    renderCorrelationPanel(data.signals || []);
  } catch (error) {
    console.error("Failed to load correlations:", error);
  }
}

function renderCorrelationPanel(signals) {
  const panel = document.getElementById("correlation-panel");
  const countEl = document.getElementById("correlation-signal-count");
  const dotEl = document.getElementById("correlation-dot");
  if (!panel) return;

  if (countEl) countEl.textContent = String(signals.length);
  if (dotEl) {
    if (signals.length > 0) {
      dotEl.classList.add("active");
    } else {
      dotEl.classList.remove("active");
    }
  }

  signalStateMap.clear();
  if (signals.length === 0) {
    panel.innerHTML = `<div class="correlation-empty">No active correlations</div>`;
    return;
  }

  panel.innerHTML = signals
    .map((sig) => {
      if (sig.metadata) signalStateMap.set(sig.signal_id, sig.metadata);
      return `
    <div class="correlation-signal severity-${escapeHtml(sig.severity)}" onclick="focusCorrelationSignal('${sig.signal_id}')">
      <div class="correlation-signal-title">${escapeHtml(sig.title)}</div>
      <div class="correlation-signal-meta">
        <span>${escapeHtml(sig.signal_type)}</span>
        <span>conf: ${Math.round(sig.confidence * 100)}%</span>
      </div>
    </div>
  `;
    })
    .join("");
}

window.focusCorrelationSignal = (signalId) => {
  const metadata = signalStateMap.get(signalId);
  if (metadata?.center_lat != null && metadata?.center_lon != null) {
    if (viewer) {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          metadata.center_lon,
          metadata.center_lat,
          500000,
        ),
      });
    }
  }
  console.log("Focus correlation:", signalId);
};

const signalStateMap = new Map();

function _focusCorrelationSignal(signalId) {
  window.focusCorrelationSignal(signalId);
}

async function loadNewsIntelligence() {
  try {
    const response = await fetch(`${apiBaseUrl}/news?limit=80`, {
      headers: sessionState.token ? { Authorization: `Bearer ${sessionState.token}` } : {},
    });
    if (!response.ok) return;

    const data = await response.json();
    newsState.items = data.items || [];
    newsState.clusters = data.clusters || [];
    newsState.feeds = data.feeds || [];
    newsState.fetchedAt = data.fetched_at;
    newsState.totalCount = data.total_count || 0;
    newsState.criticalCount = data.critical_count || 0;
    newsState.activeFeeds = data.active_feeds || 0;

    renderNewsIntelligence();
    renderNewsFeedList();
  } catch (error) {
    console.error("Failed to load news intelligence:", error);
  }
}

function renderNewsIntelligence() {
  const container = document.getElementById("news-clusters");
  if (!container) return;

  const countBadge = document.getElementById("news-count-badge");
  const feedsBadge = document.getElementById("news-feeds-badge");
  const criticalBadge = document.getElementById("news-critical-badge");

  if (countBadge) countBadge.textContent = `${newsState.totalCount} items`;
  if (feedsBadge) feedsBadge.textContent = `${newsState.activeFeeds} feeds`;
  if (criticalBadge) {
    if (newsState.criticalCount > 0) {
      criticalBadge.textContent = `${newsState.criticalCount} CRITICAL`;
      criticalBadge.classList.remove("hidden");
    } else {
      criticalBadge.classList.add("hidden");
    }
  }

  let clusters = newsState.clusters;
  if (newsState.categoryFilter) {
    clusters = clusters.filter((c) => c.category === newsState.categoryFilter);
  }

  if (clusters.length === 0) {
    container.innerHTML = `<div class="news-empty">No active intelligence feeds</div>`;
    return;
  }

  container.innerHTML = clusters
    .slice(0, 30)
    .map(
      (cluster) => `
    <div class="news-cluster severity-${cluster.threat_level}" data-cluster-id="${cluster.cluster_id}">
      <div class="news-cluster-phase ${cluster.story_phase}">${cluster.story_phase}</div>
      <div class="news-cluster-title">${escapeHtml(cluster.primary_item.title)}</div>
      <div class="news-cluster-meta">
        <span>${escapeHtml(cluster.primary_item.source)}</span>
        <span>${cluster.mention_count} mentions</span>
        <span>${cluster.country_codes.join(", ")}</span>
      </div>
    </div>
  `,
    )
    .join("");

  container.querySelectorAll(".news-cluster").forEach((el) => {
    el.addEventListener("click", () => {
      const clusterId = el.dataset.clusterId;
      showNewsDetail(clusterId);
    });
  });
}

function renderNewsFeedList() {
  const listEl = document.getElementById("news-feed-list");
  if (!listEl) return;

  listEl.innerHTML = newsState.feeds
    .map(
      (feed) => `
    <div class="news-feed-item">
      <span class="feed-name">${escapeHtml(feed.name)}</span>
      <span class="feed-count">${feed.last_item_count} items</span>
      <span class="feed-status ${feed.status === "error" ? "error" : ""}">${feed.status}</span>
    </div>
  `,
    )
    .join("");
}

async function loadWebcamChannels() {
  try {
    const region = webcamState.regionFilter;
    const url = `${apiBaseUrl}/webcams${region ? `?region=${encodeURIComponent(region)}` : ""}`;
    const response = await fetch(url);
    if (!response.ok) return;

    const data = await response.json();
    webcamState.channels = data.channels || [];
    if (data.regions && webcamState.regions.length === 0) {
      webcamState.regions = data.regions;
      populateWebcamRegionFilter();
    }

    renderWebcamGrid();
  } catch (error) {
    console.error("Failed to load webcam channels:", error);
  }
}

function renderWebcamGrid() {
  const grid = document.getElementById("webcam-grid");
  const countEl = document.getElementById("webcam-count");
  if (!grid) return;

  if (countEl) countEl.textContent = `${webcamState.channels.length} channels`;

  if (webcamState.channels.length === 0) {
    grid.innerHTML = `<div class="webcam-empty">No webcam channels available</div>`;
    return;
  }

  grid.innerHTML = webcamState.channels
    .slice(0, 24)
    .map(
      (channel) => `
    <div class="webcam-channel webcam-channel-priority-${escapeHtml(channel.priority)}" data-channel-id="${channel.channel_id}">
      <iframe
        class="webcam-iframe"
        src="https://www.youtube.com/embed/${channel.youtube_video_id}?autoplay=0&mute=1"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        loading="lazy"
        title="${escapeHtml(channel.name)}"
      ></iframe>
      <div class="webcam-channel-info">
        <div class="webcam-channel-name">${escapeHtml(channel.name)}</div>
        <div class="webcam-channel-region">${escapeHtml(channel.region)}</div>
        <div class="webcam-channel-tags">
          ${channel.relevance_tags
            .slice(0, 3)
            .map((t) => `<span class="webcam-tag">${escapeHtml(t)}</span>`)
            .join("")}
        </div>
      </div>
    </div>
  `,
    )
    .join("");

  grid.querySelectorAll(".webcam-channel").forEach((el) => {
    el.addEventListener("click", () => {
      const channelId = el.dataset.channelId;
      showWebcamDetail(channelId);
    });
  });
}

function populateWebcamRegionFilter() {
  const select = document.getElementById("webcam-region-filter");
  if (!select) return;

  webcamState.regions.forEach((region) => {
    const opt = document.createElement("option");
    opt.value = region;
    opt.textContent = region;
    select.appendChild(opt);
  });
}

function _initNewsAndWebcam() {
  const newsToggle = document.getElementById("news-toggle");
  if (newsToggle) {
    newsToggle.addEventListener("click", () => {
      newsState.enabled = !newsState.enabled;
      newsToggle.textContent = newsState.enabled ? "NEWS ON" : "NEWS OFF";
      newsToggle.classList.toggle("active", newsState.enabled);
      if (newsState.enabled) {
        loadNewsIntelligence();
      }
    });
  }

  // News category filter
  const newsFilter = document.getElementById("news-category-filter");
  if (newsFilter) {
    newsFilter.addEventListener("change", (e) => {
      newsState.categoryFilter = e.target.value;
      renderNewsIntelligence();
    });
  }

  // Webcam region filter
  const webcamFilter = document.getElementById("webcam-region-filter");
  if (webcamFilter) {
    webcamFilter.addEventListener("change", (e) => {
      webcamState.regionFilter = e.target.value;
      loadWebcamChannels();
    });
  }

  // News detail modal close
  const closeNewsDetail = document.getElementById("close-news-detail");
  if (closeNewsDetail) {
    closeNewsDetail.addEventListener("click", hideNewsDetail);
  }

  // Webcam detail modal close
  const closeWebcamDetail = document.getElementById("close-webcam-detail");
  if (closeWebcamDetail) {
    closeWebcamDetail.addEventListener("click", hideWebcamDetail);
  }
}

// ===== GLOBE VISUALIZATION FOR NEWS & WEBCAMS =====
let activeInWorldPanel = null;
let activeCesiumEntities = [];
let activeLeaderLine = null;
let panelPostRenderListener = null;

function clearInWorldPanel() {
  if (activeInWorldPanel) {
    activeInWorldPanel.remove();
    activeInWorldPanel = null;
  }
  for (const entity of activeCesiumEntities) {
    if (viewer && entity) viewer.entities.remove(entity);
  }
  activeCesiumEntities = [];
  if (viewer && activeLeaderLine) {
    viewer.entities.remove(activeLeaderLine);
    activeLeaderLine = null;
  }
  if (panelPostRenderListener && viewer) {
    viewer.scene.postRender.removeEventListener(panelPostRenderListener);
    panelPostRenderListener = null;
  }
}

function flyToLocation(lat, lon, type) {
  if (!viewer || !Number.isFinite(lat) || !Number.isFinite(lon)) return;

  const height = type === "news" ? 150_000 : type === "webcam" ? 80_000 : 50_000;
  const duration = type === "news" ? 2.0 : 1.5;

  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-45),
      roll: 0,
    },
    duration,
    easingFunction: Cesium.EasingFunction.QUAD_OUT,
  });
}

function createInWorldInfoPanel(lat, lon, data) {
  if (!viewer || !Number.isFinite(lat) || !Number.isFinite(lon)) return;

  clearInWorldPanel();

  const color = data.color || "#ef4444";
  const entityColor = Cesium.Color.fromCssColorString(color);
  const groundPos = Cesium.Cartesian3.fromDegrees(lon, lat, 0);

  // Ground marker point
  const point = viewer.entities.add({
    position: groundPos,
    point: {
      pixelSize: 16,
      color: entityColor,
      outlineColor: Cesium.Color.WHITE,
      outlineWidth: 2,
      scaleByDistance: new Cesium.NearFarScalar(1e3, 2.0, 5e6, 0.5),
    },
  });
  activeCesiumEntities.push(point);

  // Ground pulse ring (expanding)
  const ring = viewer.entities.add({
    position: groundPos,
    ellipse: {
      semiMinorAxis: new Cesium.CallbackProperty(() => {
        const t = (Date.now() % 2000) / 2000;
        return 2000 + t * 4000;
      }, false),
      semiMajorAxis: new Cesium.CallbackProperty(() => {
        const t = (Date.now() % 2000) / 2000;
        return 2000 + t * 4000;
      }, false),
      material: new Cesium.ColorMaterialProperty(
        new Cesium.CallbackProperty(() => {
          const t = (Date.now() % 2000) / 2000;
          return entityColor.withAlpha(0.4 * (1 - t));
        }, false),
      ),
      outline: false,
    },
  });
  activeCesiumEntities.push(ring);

  // Vertical leader line
  const lineTop = Cesium.Cartesian3.fromDegrees(lon, lat, 40_000);
  activeLeaderLine = viewer.entities.add({
    polyline: {
      positions: [groundPos, lineTop],
      width: 3,
      material: new Cesium.PolylineGlowMaterialProperty({
        glowPower: 0.3,
        color: entityColor,
      }),
    },
  });

  // Top label on the line
  const label = viewer.entities.add({
    position: lineTop,
    label: {
      text: data.title.length > 30 ? `${data.title.substring(0, 30)}...` : data.title,
      font: "bold 13px monospace",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 3,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -10),
      scaleByDistance: new Cesium.NearFarScalar(1e3, 1.5, 2e6, 0.5),
      translucencyByDistance: new Cesium.NearFarScalar(1e3, 1.0, 2e6, 0.3),
      showBackground: true,
      backgroundColor: new Cesium.Color(0.05, 0.05, 0.08, 0.85),
      backgroundPadding: new Cesium.Cartesian2(8, 4),
    },
  });
  activeCesiumEntities.push(label);

  // Badge label
  const badgeLabel = viewer.entities.add({
    position: lineTop,
    label: {
      text: ` [${data.badge}] `,
      font: "bold 11px monospace",
      fillColor: Cesium.Color.WHITE,
      outlineColor: entityColor,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.TOP,
      pixelOffset: new Cesium.Cartesian2(0, 10),
      scaleByDistance: new Cesium.NearFarScalar(1e3, 1.5, 2e6, 0.5),
      showBackground: true,
      backgroundColor: entityColor.withAlpha(0.9),
      backgroundPadding: new Cesium.Cartesian2(6, 2),
    },
  });
  activeCesiumEntities.push(badgeLabel);

  // Create DOM overlay panel that tracks the 3D position
  const panel = document.createElement("div");
  panel.className = "inworld-info-panel inworld-panel-visible";
  panel.style.opacity = "1";
  panel.style.transform = "scale(1)";
  panel.innerHTML = `
    <div class="inworld-panel-header">
      <span class="inworld-panel-badge" style="background:${color}">${data.badge}</span>
      <span class="inworld-panel-title">${escapeHtml(data.title)}</span>
      <button class="inworld-panel-close" title="Close">&times;</button>
    </div>
    <div class="inworld-panel-body">
      ${data.lines.map((line) => `<div class="inworld-panel-line">${escapeHtml(line)}</div>`).join("")}
      ${data.link ? `<a href="${data.link}" target="_blank" class="inworld-panel-link">Open Source &rarr;</a>` : ""}
      ${data.videoId ? `<a href="https://www.youtube.com/watch?v=${data.videoId}" target="_blank" class="inworld-panel-link">Watch Live &rarr;</a>` : ""}
    </div>
    <div class="inworld-panel-arrow" style="border-top-color:rgba(8,8,14,0.92)"></div>
  `;

  const viewport = document.getElementById("viewport-container") || document.body;
  viewport.appendChild(panel);
  activeInWorldPanel = panel;

  // Close handler
  panel.querySelector(".inworld-panel-close").addEventListener("click", clearInWorldPanel);

  // Auto-dismiss after 30s
  setTimeout(() => {
    if (activeInWorldPanel === panel) clearInWorldPanel();
  }, 30_000);

  // Position tracker - projects 3D position to screen space every frame
  panelPostRenderListener = () => {
    if (!viewer || !activeInWorldPanel || viewer.isDestroyed()) return;

    try {
      const canvasPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(viewer.scene, lineTop);
      if (!canvasPos) {
        panel.style.opacity = "0";
        return;
      }

      const rect = viewport.getBoundingClientRect();
      const x = canvasPos.x - rect.left;
      const y = canvasPos.y - rect.top - panel.offsetHeight - 16;

      // Occlusion check - is the point behind the globe?
      const ellipsoid = viewer.scene.globe.ellipsoid;
      const cameraPos = viewer.camera.position;
      const occluder = new Cesium.EllipsoidalOccluder(ellipsoid, cameraPos);
      const occludeePos = Cesium.Cartographic.fromDegrees(lon, lat, 0);
      const isVisible = !occluder.isPointHidden(occludeePos);

      if (isVisible && x > -200 && y > -200 && x < rect.width + 200 && y < rect.height + 200) {
        panel.style.opacity = "1";
        panel.style.transform = "scale(1)";
        panel.style.left = `${x}px`;
        panel.style.top = `${y}px`;
      } else {
        panel.style.opacity = "0";
        panel.style.transform = "scale(0.8)";
      }
    } catch (_e) {
      // ignore projection errors
    }
  };

  viewer.scene.postRender.addEventListener(panelPostRenderListener);
}

function getSeverityColor(severity) {
  const colors = {
    critical: "#ef4444",
    high: "#f97316",
    medium: "#eab308",
    low: "#3b82f6",
    none: "#6b7280",
  };
  return colors[severity] || "#6b7280";
}

// ===== NEWS DETAIL — IN WORLD PANEL =====
function showNewsDetail(clusterId) {
  const cluster = newsState.clusters.find((c) => c.cluster_id === clusterId);
  if (!cluster) return;

  const lines = [
    cluster.primary_item.category.toUpperCase(),
    `${cluster.mention_count} mentions · ${cluster.source_count} sources`,
    `Velocity: ${cluster.velocity_score.toFixed(1)}/hr · Threat: ${cluster.threat_level}`,
    cluster.country_codes.join(", ") || "Global",
  ];

  if (cluster.center_lat != null && cluster.center_lon != null) {
    createInWorldInfoPanel(cluster.center_lat, cluster.center_lon, {
      title: cluster.primary_item.title,
      badge: "N",
      color: getSeverityColor(cluster.threat_level),
      lines,
      link: cluster.primary_item.link,
    });
    flyToLocation(cluster.center_lat, cluster.center_lon, "news");
  }
}

function hideNewsDetail() {
  clearInWorldPanel();
}

// ===== WEBCAM DETAIL — IN WORLD PANEL =====
function showWebcamDetail(channelId) {
  const channel = webcamState.channels.find((c) => c.channel_id === channelId);
  if (!channel) return;

  const lines = [
    channel.region,
    `${channel.country_code} · ${channel.priority} priority`,
    `${channel.lat.toFixed(4)}, ${channel.lon.toFixed(4)}`,
    channel.relevance_tags.slice(0, 3).join(" · "),
  ];

  createInWorldInfoPanel(channel.lat, channel.lon, {
    title: channel.name,
    badge: "TV",
    color: channel.priority === "high" ? "#ef4444" : "#3b82f6",
    lines,
    videoId: channel.youtube_video_id,
  });
  flyToLocation(channel.lat, channel.lon, "webcam");
}

function hideWebcamDetail() {
  clearInWorldPanel();
}

// ===== INIT NEWS AND WEBCAM =====
function initNewsAndWebcam() {
  const newsToggle = document.getElementById("news-toggle");
  if (newsToggle) {
    newsToggle.addEventListener("click", () => {
      newsState.enabled = !newsState.enabled;
      newsToggle.textContent = newsState.enabled ? "NEWS ON" : "NEWS OFF";
      newsToggle.classList.toggle("active", newsState.enabled);
      if (newsState.enabled) {
        loadNewsIntelligence();
      }
    });
  }

  // News category filter
  const newsFilter = document.getElementById("news-category-filter");
  if (newsFilter) {
    newsFilter.addEventListener("change", (e) => {
      newsState.categoryFilter = e.target.value;
      renderNewsIntelligence();
    });
  }

  // Webcam region filter
  const webcamFilter = document.getElementById("webcam-region-filter");
  if (webcamFilter) {
    webcamFilter.addEventListener("change", (e) => {
      webcamState.regionFilter = e.target.value;
      loadWebcamChannels();
    });
  }

  // News detail modal close
  const closeNewsDetail = document.getElementById("close-news-detail");
  if (closeNewsDetail) {
    closeNewsDetail.addEventListener("click", hideNewsDetail);
  }

  // Webcam detail modal close
  const closeWebcamDetail = document.getElementById("close-webcam-detail");
  if (closeWebcamDetail) {
    closeWebcamDetail.addEventListener("click", hideWebcamDetail);
  }
}

// ===== INCIDENTS =====

async function loadIncidents() {
  try {
    const response = await fetch(`${apiBaseUrl}/incidents`, {
      headers: getAuthHeaders(),
    });

    if (handleUnauthorized(response)) {
      return [];
    }

    const data = await response.json();
    return data.incidents || [];
  } catch (error) {
    console.error("Failed to load incidents:", error);
    return [];
  }
}

async function loadIncidentTimeline(incidentId) {
  try {
    const response = await fetch(`${apiBaseUrl}/incidents/${incidentId}/timeline`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      console.error("Failed to load incident timeline");
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Failed to load incident timeline:", error);
    return null;
  }
}

async function loadIncidentLinks(incidentId) {
  try {
    const response = await fetch(`${apiBaseUrl}/incidents/${incidentId}/links`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.links || [];
  } catch (error) {
    console.error("Failed to load incident links:", error);
    return [];
  }
}

async function linkAlertToIncident(incidentId, alertId) {
  try {
    const response = await fetch(`${apiBaseUrl}/incidents/${incidentId}/links`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        alert_id: alertId,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Failed to link alert: ${error.message || error.error}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Failed to link alert to incident:", error);
    alert("Failed to link alert to incident");
    return false;
  }
}

async function loadIncidentChapters(incidentId) {
  try {
    const response = await fetch(`${apiBaseUrl}/incidents/${incidentId}/chapters`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.chapters || [];
  } catch (error) {
    console.error("Failed to load incident chapters:", error);
    return [];
  }
}

window.showIncidentModal = () => {
  dom.incidentModal.classList.remove("hidden");
  renderIncidentList();
};

function hideIncidentModal() {
  dom.incidentModal.classList.add("hidden");
}

function showNewIncidentForm() {
  dom.newIncidentModal.classList.remove("hidden");
  dom.incidentModal.classList.add("hidden");
}

function hideNewIncidentForm() {
  dom.newIncidentModal.classList.add("hidden");
  dom.incidentModal.classList.remove("hidden");
}

let _pendingAlertToLink = null;

async function showLinkIncidentModal(alertId) {
  _pendingAlertToLink = alertId;

  const incidents = await loadIncidents();
  const openIncidents = incidents.filter(
    (i) => i.status === "open" || i.status === "investigating",
  );

  if (openIncidents.length === 0) {
    alert("No open incidents available. Create an incident first.");
    return;
  }

  const selection = prompt(
    `Link alert to incident:\n` +
      openIncidents.map((i, idx) => `${idx + 1}. ${i.title} (${i.incident_id})`).join("\n") +
      `\n\nEnter number (or 0 to cancel):`,
  );

  if (!selection) return;

  const index = parseInt(selection, 10) - 1;
  if (index < 0 || index >= openIncidents.length) return;

  const selectedIncident = openIncidents[index];
  const success = await linkAlertToIncident(selectedIncident.incident_id, alertId);

  if (success) {
    alert(`Alert linked to incident: ${selectedIncident.title}`);
    dom.alertModal.classList.add("hidden");
  }
}

async function renderIncidentList() {
  const incidents = await loadIncidents();

  if (incidents.length === 0) {
    dom.incidentList.innerHTML = '<div class="no-incidents">No incidents found</div>';
    return;
  }

  dom.incidentList.innerHTML = incidents
    .map(
      (incident) => `
      <div class="incident-list-item" data-incident-id="${incident.incident_id}">
        <div class="incident-title">${incident.title}</div>
        <div class="incident-meta">
          <span class="incident-severity ${incident.severity}">${incident.severity}</span>
          <span class="incident-status ${incident.status}">${incident.status}</span>
        </div>
        <div class="incident-time">${new Date(incident.start_at).toLocaleString()} - ${new Date(incident.end_at).toLocaleString()}</div>
      </div>
    `,
    )
    .join("");

  dom.incidentList.querySelectorAll(".incident-list-item").forEach((item) => {
    item.addEventListener("click", () => {
      openIncident(item.dataset.incidentId);
      hideIncidentModal();
    });
  });
}

async function openIncident(incidentId) {
  updateStatus("LOADING INCIDENT...");

  try {
    const response = await fetch(`${apiBaseUrl}/incidents/${incidentId}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      updateStatus("FAILED TO LOAD INCIDENT");
      return;
    }

    const incident = await response.json();
    incidentState.currentIncident = incident;

    const timeline = await loadIncidentTimeline(incidentId);
    if (timeline) {
      incidentState.timeline = timeline;
      incidentState.markers = timeline.markers || [];
    }

    incidentState.chapters = await loadIncidentChapters(incidentId);
    incidentState.links = await loadIncidentLinks(incidentId);
    await loadIncidentIntelligence(incidentId);

    incidentState.isActive = true;
    incidentState.playback.currentTime = new Date(incident.start_at);
    incidentState.playback.section = "during";

    renderIncidentPanel();
    showIncidentPanel();
    loadCaptureJobs();
    loadEvidence();

    if (incident.aoi) {
      focusOnAOI(incident.aoi);
    } else {
      const mapContextWidget = incidentState.intelligence.widgets.find(
        (widget) => widget.widget_type === "map_context",
      );
      const focus = mapContextWidget?.spec?.focus;
      if (typeof focus?.lat === "number" && typeof focus?.lon === "number") {
        focusMapOnLocation(focus.lat, focus.lon);
      }
    }

    updateStatus(`INCIDENT: ${incident.title.toUpperCase()}`);
    emitSwanActivity("incident_opened", {
      targetType: "incident",
      targetId: incidentId,
      context: {
        incident_title: incident.title,
        incident_status: incident.status,
      },
    });
  } catch (error) {
    console.error("Failed to open incident:", error);
    updateStatus("INCIDENT LOAD FAILED");
  }
  syncStateToUrl();
}

function showIncidentPanel() {
  dom.incidentPanel.classList.remove("hidden");
}

function hideIncidentPanel() {
  dom.incidentPanel.classList.add("hidden");
  closeIncident();
}

function clearIncidentTimelineEntities() {
  clearEntityMap(incidentState.entities);
}

function clearIncidentContextEntities() {
  clearEntityMap(incidentState.contextEntities);
}

function clearIncidentIntelligenceEntities() {
  clearEntityMap(incidentState.intelligenceEntities);
}

function renderIncidentContext() {
  clearIncidentContextEntities();

  const incident = incidentState.currentIncident;
  if (!viewer || !incident?.aoi || typeof Cesium === "undefined") {
    return;
  }

  const aoi = incident.aoi;
  const labelText = incident.title || "Incident AOI";

  if (
    aoi.type === "Point" &&
    Array.isArray(aoi.coordinates) &&
    typeof aoi.coordinates[0] === "number" &&
    typeof aoi.coordinates[1] === "number"
  ) {
    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(aoi.coordinates[0], aoi.coordinates[1], 0),
      point: {
        pixelSize: 16,
        color: Cesium.Color.fromCssColorString("#ef4444").withAlpha(0.85),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: {
        text: labelText,
        font: "11px monospace",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -16),
      },
    });
    incidentState.contextEntities.set(`incident-aoi-${incident.incident_id}`, entity);
    return;
  }

  if (aoi.type === "Polygon" && Array.isArray(aoi.coordinates?.[0])) {
    const positions = aoi.coordinates[0]
      .filter(
        (point) =>
          Array.isArray(point) && typeof point[0] === "number" && typeof point[1] === "number",
      )
      .map((point) => Cesium.Cartesian3.fromDegrees(point[0], point[1], 0));

    if (positions.length >= 3) {
      const fillEntity = viewer.entities.add({
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(positions),
          material: Cesium.Color.fromCssColorString("#ef4444").withAlpha(0.12),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString("#ef4444").withAlpha(0.85),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
      });
      incidentState.contextEntities.set(`incident-aoi-fill-${incident.incident_id}`, fillEntity);
    }
  }

  const points = getAoiCoordinatePairs(aoi);
  if (points.length === 0) {
    return;
  }

  const center = points.reduce(
    (accumulator, [lon, lat]) => ({
      lon: accumulator.lon + lon,
      lat: accumulator.lat + lat,
    }),
    { lon: 0, lat: 0 },
  );
  const centerLon = center.lon / points.length;
  const centerLat = center.lat / points.length;
  const labelEntity = viewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(centerLon, centerLat, 0),
    label: {
      text: labelText,
      font: "11px monospace",
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      pixelOffset: new Cesium.Cartesian2(0, -12),
    },
  });
  incidentState.contextEntities.set(`incident-aoi-label-${incident.incident_id}`, labelEntity);
}

function closeIncident() {
  stopIncidentPlayback();
  clearIncidentTimelineEntities();
  clearIncidentContextEntities();
  clearIncidentIntelligenceEntities();
  incidentState.currentIncident = null;
  incidentState.timeline = null;
  incidentState.chapters = [];
  incidentState.links = [];
  incidentState.markers = [];
  incidentState.captureJobs = [];
  incidentState.evidence = [];
  incidentState.intelligence = {
    artifacts: [],
    widgets: [],
    runs: [],
    updatedAt: null,
  };
  incidentState.isActive = false;
  incidentState.playback.currentTime = null;
  incidentState.playback.section = "during";

  updateStatus("REPLAY MODE");
}

function renderIncidentPanel() {
  const incident = incidentState.currentIncident;
  if (!incident) return;

  dom.incidentTitle.textContent = incident.title;
  dom.incidentSeverity.textContent = incident.severity.toUpperCase();
  dom.incidentSeverity.className = `incident-severity ${incident.severity}`;
  dom.incidentStatus.textContent = incident.status.toUpperCase();
  dom.incidentStatus.className = `incident-status ${incident.status}`;

  const startDate = new Date(incident.start_at);
  const endDate = new Date(incident.end_at);
  dom.incidentTime.textContent = `${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString()} - ${endDate.toLocaleTimeString()}`;

  updateSectionCounts();
  renderChapters();
  renderLinkedAlerts();
  renderIncidentContext();
  renderCorrelationTimeline();
  renderIncidentIntelligence();
  dom.incidentChapters.insertAdjacentHTML(
    "beforeend",
    renderSwanInsights("incident", incident.incident_id),
  );
}

function updateSectionCounts() {
  const timeline = incidentState.timeline;
  if (!timeline) {
    dom.beforeCount.textContent = "0";
    dom.duringCount.textContent = "0";
    dom.afterCount.textContent = "0";
    return;
  }

  const beforeMarkers = timeline.markers.filter((m) => m.section === "before");
  const duringMarkers = timeline.markers.filter((m) => m.section === "during");
  const afterMarkers = timeline.markers.filter((m) => m.section === "after");

  dom.beforeCount.textContent = String(beforeMarkers.length);
  dom.duringCount.textContent = String(duringMarkers.length);
  dom.afterCount.textContent = String(afterMarkers.length);
}

function renderChapters() {
  const chapters = incidentState.chapters;

  if (chapters.length === 0) {
    dom.incidentChapters.innerHTML = '<div class="no-chapters">No chapters defined</div>';
    return;
  }

  dom.incidentChapters.innerHTML = chapters
    .map(
      (chapter) => `
      <div class="chapter-marker" data-chapter-id="${chapter.chapter_id}" data-timestamp="${chapter.timestamp}">
        <span class="chapter-timestamp">${new Date(chapter.timestamp).toLocaleTimeString()}</span>
        <span class="chapter-title">${chapter.title}</span>
      </div>
    `,
    )
    .join("");

  dom.incidentChapters.querySelectorAll(".chapter-marker").forEach((marker) => {
    marker.addEventListener("click", () => {
      const timestamp = new Date(marker.dataset.timestamp);
      jumpToIncidentTime(timestamp);
    });
  });
}

function renderLinkedAlerts() {
  const links = incidentState.links;
  const alertLinks = links.filter((link) => link.alert_id);

  const linkedAlertsContainer = document.getElementById("incident-linked-alerts");
  if (!linkedAlertsContainer) return;

  if (alertLinks.length === 0) {
    linkedAlertsContainer.innerHTML = '<div class="no-linked-alerts">No linked alerts</div>';
    return;
  }

  linkedAlertsContainer.innerHTML = alertLinks
    .map(
      (link) => `
      <div class="linked-alert-chip ${link.alert_id?.severity || ""}" data-alert-id="${link.alert_id}">
        <span class="linked-alert-severity">${link.alert_id?.severity || "unknown"}</span>
        <span class="linked-alert-summary">${link.alert_id?.summary || link.alert_id}</span>
      </div>
    `,
    )
    .join("");

  linkedAlertsContainer.querySelectorAll(".linked-alert-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      showAlertDetail(chip.dataset.alertId);
    });
  });
}

async function loadCaptureJobs() {
  const incident = incidentState.currentIncident;
  if (!incident) return;

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/incidents/${incident.incident_id}/capture-jobs`,
      { headers: getAuthHeaders() },
    );

    if (!response.ok) {
      console.error("Failed to load capture jobs:", response.statusText);
      return;
    }

    const data = await response.json();
    incidentState.captureJobs = data.capture_jobs || [];
    renderCaptureJobs();
    renderEvidenceList();
  } catch (error) {
    console.error("Error loading capture jobs:", error);
  }
}

async function loadEvidence() {
  const incident = incidentState.currentIncident;
  if (!incident) return;

  try {
    const response = await fetch(`${getApiBaseUrl()}/incidents/${incident.incident_id}/evidence`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      console.error("Failed to load evidence:", response.statusText);
      return;
    }

    const data = await response.json();
    incidentState.evidence = data.evidence || [];
    renderEvidenceList();
  } catch (error) {
    console.error("Error loading evidence:", error);
  }
}

async function loadIncidentIntelligence(incidentId) {
  try {
    const response = await fetch(`${apiBaseUrl}/incidents/${incidentId}/intelligence`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      return;
    }

    const intelligence = await response.json();
    incidentState.intelligence = {
      artifacts: intelligence.artifacts || [],
      widgets: intelligence.widgets || [],
      runs: intelligence.runs || [],
      updatedAt:
        intelligence.runs?.[0]?.completed_at ||
        intelligence.widgets?.[0]?.updated_at ||
        intelligence.artifacts?.[0]?.published_at ||
        intelligence.artifacts?.[0]?.captured_at ||
        null,
    };
    renderIncidentIntelligence();
  } catch (error) {
    console.error("Error loading incident intelligence:", error);
  }
}

async function refreshIncidentIntelligenceBundle() {
  const incident = incidentState.currentIncident;
  if (!incident) return;

  if (!sessionState.isAuthenticated) {
    showAuthModal();
    return;
  }

  try {
    if (dom.incidentIntelligenceStatus) {
      dom.incidentIntelligenceStatus.textContent = "Refreshing incident intelligence...";
    }

    const response = await fetch(
      `${getApiBaseUrl()}/incidents/${incident.incident_id}/intelligence/refresh`,
      {
        method: "POST",
        headers: getAuthHeaders(),
      },
    );

    if (!response.ok) {
      console.error("Failed to refresh incident intelligence:", response.statusText);
      if (dom.incidentIntelligenceStatus) {
        dom.incidentIntelligenceStatus.textContent = "Incident intelligence refresh failed";
      }
      return;
    }

    const refreshed = await response.json();
    incidentState.intelligence = {
      artifacts: refreshed.intelligence?.artifacts || [],
      widgets: refreshed.intelligence?.widgets || [],
      runs: refreshed.intelligence?.runs || [],
      updatedAt: refreshed.updated_at || new Date().toISOString(),
    };
    renderIncidentIntelligence();
  } catch (error) {
    console.error("Error refreshing incident intelligence:", error);
    if (dom.incidentIntelligenceStatus) {
      dom.incidentIntelligenceStatus.textContent = "Incident intelligence refresh failed";
    }
  }
}

function renderCaptureJobs() {
  const jobs = incidentState.captureJobs || [];

  if (jobs.length === 0) {
    dom.captureJobList.innerHTML = '<div class="no-capture-jobs">No capture jobs</div>';
    return;
  }

  dom.captureJobList.innerHTML = jobs
    .map((job) => {
      const sourceName = getSourceDisplayName(job.source_type);
      const canRun = job.status === "pending";
      const canFreeze = job.status === "completed" && job.freeze_status !== "frozen";

      return `
      <div class="capture-job-item" data-job-id="${job.capture_job_id}">
        <div class="capture-job-info">
          <span class="capture-job-source">${sourceName}</span>
          <span class="capture-job-status ${job.status}">${job.status}</span>
          ${job.snapshot_count > 0 ? `<span class="capture-job-count">(${job.snapshot_count} snapshots)</span>` : ""}
        </div>
        <div class="capture-job-actions">
          ${canRun ? `<button type="button" class="capture-job-btn run-capture" data-job-id="${job.capture_job_id}">RUN</button>` : ""}
          ${canFreeze ? `<button type="button" class="capture-job-btn freeze-capture" data-job-id="${job.capture_job_id}">FREEZE</button>` : ""}
        </div>
      </div>
    `;
    })
    .join("");

  dom.captureJobList.querySelectorAll(".run-capture").forEach((btn) => {
    btn.addEventListener("click", () => runCaptureJob(btn.dataset.jobId));
  });

  dom.captureJobList.querySelectorAll(".freeze-capture").forEach((btn) => {
    btn.addEventListener("click", () => freezeEvidence(btn.dataset.jobId));
  });
}

function renderEvidenceList() {
  const evidence = incidentState.evidence || [];

  if (evidence.length === 0) {
    dom.evidenceList.innerHTML = '<div class="no-evidence">No frozen evidence</div>';
    return;
  }

  dom.evidenceList.innerHTML = evidence
    .map(
      (e) => `
      <div class="evidence-item" data-freeze-id="${e.freeze_id}">
        <div class="evidence-info">
          <span class="evidence-icon">❄️</span>
          <span class="evidence-source">${e.source_name}</span>
        </div>
        <span class="evidence-stats">${e.frozen_snapshots}/${e.total_snapshots} snapshots</span>
      </div>
    `,
    )
    .join("");
}

function getIncidentIntelligenceMarkerColor(artifactType) {
  switch (artifactType) {
    case "article":
      return "#38bdf8";
    case "image":
      return "#f59e0b";
    case "video":
      return "#a855f7";
    case "report":
      return "#22c55e";
    default:
      return "#94a3b8";
  }
}

function renderIncidentIntelligenceMapEntities() {
  clearIncidentIntelligenceEntities();

  if (!viewer || typeof Cesium === "undefined") {
    return;
  }

  const mapContextWidget = incidentState.intelligence.widgets.find(
    (widget) => widget.widget_type === "map_context",
  );
  const spec = mapContextWidget?.spec || {};
  const items = Array.isArray(spec.items) ? spec.items : [];

  items.forEach((item, index) => {
    if (typeof item?.lat !== "number" || typeof item?.lon !== "number") {
      return;
    }

    const color = getIncidentIntelligenceMarkerColor(item.artifact_type);
    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(item.lon, item.lat, 0),
      point: {
        pixelSize: 11,
        color: Cesium.Color.fromCssColorString(color).withAlpha(0.85),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      },
      label: {
        text: item.title || item.provider || "Intelligence",
        font: "10px monospace",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -14),
        show: index < 3,
      },
      properties: {
        type: "incident_intelligence",
        item: item,
      },
    });

    incidentState.intelligenceEntities.set(
      item.artifact_id || `${item.provider || "intel"}-${index}`,
      entity,
    );
  });
}

function renderIncidentIntelligenceWidget(widget) {
  const widgetType = escapeHtml(widget.widget_type.replaceAll("_", " "));
  const title = escapeHtml(widget.title);
  const spec = widget.spec || {};

  if (widget.widget_type === "summary") {
    const providers = spec.providers || {};
    return `
      <div class="incident-intel-widget">
        <div class="incident-intel-widget-head">
          <div class="incident-intel-widget-title">${title}</div>
          <div class="incident-intel-widget-type">${widgetType}</div>
        </div>
        <div class="incident-intel-stat-grid">
          <div class="incident-intel-stat">
            <span class="incident-intel-stat-label">Articles</span>
            <span class="incident-intel-stat-value">${escapeHtml(spec.article_count || 0)}</span>
          </div>
          <div class="incident-intel-stat">
            <span class="incident-intel-stat-label">Media</span>
            <span class="incident-intel-stat-value">${escapeHtml(spec.media_count || 0)}</span>
          </div>
          <div class="incident-intel-stat">
            <span class="incident-intel-stat-label">Located</span>
            <span class="incident-intel-stat-value">${escapeHtml(
              spec.located_artifact_count || 0,
            )}</span>
          </div>
          <div class="incident-intel-stat">
            <span class="incident-intel-stat-label">Providers</span>
            <span class="incident-intel-stat-value">${escapeHtml(Object.keys(providers).length)}</span>
          </div>
        </div>
        <div class="incident-intel-link-meta">Updated ${escapeHtml(
          formatRelativeAge(spec.latest_artifact_at),
        )}</div>
      </div>
    `;
  }

  if (widget.widget_type === "map_context") {
    const focus = spec.focus || {};
    const items = Array.isArray(spec.items) ? spec.items : [];
    const focusButton =
      typeof focus.lat === "number" && typeof focus.lon === "number"
        ? `
            <button
              type="button"
              class="incident-intel-focus"
              data-lat="${escapeHtml(focus.lat)}"
              data-lon="${escapeHtml(focus.lon)}"
              data-height="15000"
            >
              FOCUS INCIDENT
            </button>
          `
        : "";

    return `
      <div class="incident-intel-widget">
        <div class="incident-intel-widget-head">
          <div class="incident-intel-widget-title">${title}</div>
          <div class="incident-intel-widget-type">${widgetType}</div>
        </div>
        <div class="incident-intel-stat-grid">
          <div class="incident-intel-stat">
            <span class="incident-intel-stat-label">Located</span>
            <span class="incident-intel-stat-value">${escapeHtml(spec.located_artifact_count || 0)}</span>
          </div>
          <div class="incident-intel-stat">
            <span class="incident-intel-stat-label">Artifacts</span>
            <span class="incident-intel-stat-value">${escapeHtml(spec.total_artifact_count || 0)}</span>
          </div>
          <div class="incident-intel-stat">
            <span class="incident-intel-stat-label">Focus</span>
            <span class="incident-intel-stat-value">${escapeHtml(
              focus.source ? String(focus.source).replaceAll("_", " ") : "--",
            )}</span>
          </div>
          <div class="incident-intel-stat">
            <span class="incident-intel-stat-label">AOI</span>
            <span class="incident-intel-stat-value">${escapeHtml(spec.has_incident_aoi ? "yes" : "no")}</span>
          </div>
        </div>
        ${focusButton ? `<div class="incident-intel-actions">${focusButton}</div>` : ""}
        ${
          items.length > 0
            ? `
              <div class="incident-intel-list">
                ${items
                  .map(
                    (item) => `
                      <div class="incident-intel-link">
                        <div class="incident-intel-link-body">
                          <div class="incident-intel-link-title">${escapeHtml(item.title || "Untitled")}</div>
                          <div class="incident-intel-link-meta">${escapeHtml(item.provider || "")}${
                            item.artifact_type ? ` - ${escapeHtml(item.artifact_type)}` : ""
                          }</div>
                        </div>
                        <button
                          type="button"
                          class="incident-intel-focus"
                          data-lat="${escapeHtml(item.lat)}"
                          data-lon="${escapeHtml(item.lon)}"
                          data-height="8000"
                        >
                          MAP
                        </button>
                      </div>
                    `,
                  )
                  .join("")}
              </div>
            `
            : '<div class="incident-intel-link-meta">No geolocated artifacts available yet.</div>'
        }
      </div>
    `;
  }

  if (widget.widget_type === "related_articles" || widget.widget_type === "media_gallery") {
    const items = Array.isArray(spec.items) ? spec.items : [];
    return `
      <div class="incident-intel-widget">
        <div class="incident-intel-widget-head">
          <div class="incident-intel-widget-title">${title}</div>
          <div class="incident-intel-widget-type">${widgetType}</div>
        </div>
        <div class="incident-intel-list">
          ${items
            .map(
              (item) => `
                <a class="incident-intel-link" href="${escapeHtml(item.url || "#")}" target="_blank" rel="noopener noreferrer">
                  ${
                    item.thumbnail_url
                      ? `<img class="incident-intel-thumb" src="${escapeHtml(item.thumbnail_url)}" alt="${escapeHtml(item.title || widget.title)}" />`
                      : ""
                  }
                  <div class="incident-intel-link-body">
                    <div class="incident-intel-link-title">${escapeHtml(item.title || "Untitled")}</div>
                    <div class="incident-intel-link-meta">${escapeHtml(item.provider || "")}${
                      item.published_at
                        ? ` • ${escapeHtml(formatRelativeAge(item.published_at))}`
                        : ""
                    }</div>
                  </div>
                </a>
              `,
            )
            .join("")}
        </div>
      </div>
    `;
  }

  if (widget.widget_type === "source_provenance") {
    const providers = Array.isArray(spec.providers) ? spec.providers : [];
    const verification = spec.verification_breakdown || {};
    return `
      <div class="incident-intel-widget">
        <div class="incident-intel-widget-head">
          <div class="incident-intel-widget-title">${title}</div>
          <div class="incident-intel-widget-type">${widgetType}</div>
        </div>
        <div class="incident-intel-list">
          ${providers
            .map(
              (provider) => `
                <div class="incident-intel-link">
                  <div class="incident-intel-link-body">
                    <div class="incident-intel-link-title">${escapeHtml(provider.provider || "Unknown")}</div>
                    <div class="incident-intel-link-meta">${escapeHtml(provider.count || 0)} artifacts</div>
                  </div>
                </div>
              `,
            )
            .join("")}
          <div class="incident-intel-link">
            <div class="incident-intel-link-body">
              <div class="incident-intel-link-title">Verification</div>
              <div class="incident-intel-link-meta">${escapeHtml(
                Object.entries(verification)
                  .map(([key, count]) => `${key}: ${count}`)
                  .join(" • "),
              )}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (widget.widget_type === "pattern_brief") {
    const notes = Array.isArray(spec.notes) ? spec.notes : [];
    return `
      <div class="incident-intel-widget">
        <div class="incident-intel-widget-head">
          <div class="incident-intel-widget-title">${title}</div>
          <div class="incident-intel-widget-type">${widgetType}</div>
        </div>
        <ul class="incident-intel-notes">
          ${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
        </ul>
      </div>
    `;
  }

  return `
    <div class="incident-intel-widget">
      <div class="incident-intel-widget-head">
        <div class="incident-intel-widget-title">${title}</div>
        <div class="incident-intel-widget-type">${widgetType}</div>
      </div>
      <div class="incident-intel-link-meta">No renderer defined for this widget type yet.</div>
    </div>
  `;
}

function renderIncidentIntelligence() {
  if (!dom.incidentIntelligenceContent || !dom.incidentIntelligenceStatus) {
    return;
  }

  const intelligence = incidentState.intelligence || {
    artifacts: [],
    widgets: [],
    runs: [],
    updatedAt: null,
  };

  if ((intelligence.widgets || []).length === 0 && (intelligence.artifacts || []).length === 0) {
    dom.incidentIntelligenceStatus.textContent = "No incident intelligence collected yet";
    dom.incidentIntelligenceContent.innerHTML =
      '<div class="no-intelligence">Run a refresh to collect related articles, media, and provenance.</div>';
    clearIncidentIntelligenceEntities();
    return;
  }

  dom.incidentIntelligenceStatus.textContent = intelligence.updatedAt
    ? `Last updated ${formatRelativeAge(intelligence.updatedAt)}`
    : "Incident intelligence loaded";
  dom.incidentIntelligenceContent.innerHTML = (intelligence.widgets || [])
    .map((widget) => renderIncidentIntelligenceWidget(widget))
    .join("");

  dom.incidentIntelligenceContent.querySelectorAll(".incident-intel-focus").forEach((button) => {
    button.addEventListener("click", () => {
      const lat = Number.parseFloat(button.dataset.lat || "");
      const lon = Number.parseFloat(button.dataset.lon || "");
      const height = Number.parseFloat(button.dataset.height || "12000");

      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        focusMapOnLocation(lat, lon, Number.isFinite(height) ? height : 12000);
      }
    });
  });

  renderIncidentIntelligenceMapEntities();
}

async function createCaptureJob(sourceType) {
  const incident = incidentState.currentIncident;
  if (!incident) return;

  if (!sessionState.isAuthenticated) {
    showAuthModal();
    return;
  }

  try {
    const response = await fetch(
      `${getApiBaseUrl()}/incidents/${incident.incident_id}/capture-jobs`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ source_type: sourceType }),
      },
    );

    if (!response.ok) {
      console.error("Failed to create capture job:", response.statusText);
      return;
    }

    await loadCaptureJobs();
  } catch (error) {
    console.error("Error creating capture job:", error);
  }
}

async function runCaptureJob(captureJobId) {
  if (!sessionState.isAuthenticated) {
    showAuthModal();
    return;
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/capture-jobs/${captureJobId}/run`, {
      method: "POST",
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      console.error("Failed to run capture job:", response.statusText);
      return;
    }

    await loadCaptureJobs();
    await loadEvidence();
  } catch (error) {
    console.error("Error running capture job:", error);
  }
}

async function freezeEvidence(captureJobId) {
  if (!sessionState.isAuthenticated) {
    showAuthModal();
    return;
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/capture-jobs/${captureJobId}/freeze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      console.error("Failed to freeze evidence:", response.statusText);
      return;
    }

    await loadCaptureJobs();
    await loadEvidence();
  } catch (error) {
    console.error("Error freezing evidence:", error);
  }
}

function showCaptureSourceModal() {
  const modal = document.createElement("div");
  modal.className = "modal capture-modal";
  modal.id = "capture-source-modal";

  const sources = [
    { type: "flights", name: "Live Flights", status: "ADS-B / Telemetry" },
    { type: "earthquakes", name: "Earthquakes", status: "USGS" },
    { type: "satellites", name: "Satellites", status: "CelesTrak" },
    { type: "weather", name: "Weather", status: "NOAA" },
    { type: "bikeshare", name: "Bikeshare", status: "CityBikes" },
    { type: "alerts", name: "Alerts", status: "MORDOR Alerts" },
    { type: "events", name: "Object Events", status: "Tracked Objects" },
  ];

  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>ADD CAPTURE JOB</h2>
        <button type="button" class="panel-close" id="close-capture-modal">×</button>
      </div>
      <div class="modal-body">
        <div class="capture-source-grid">
          ${sources
            .map(
              (s) => `
            <button type="button" class="capture-source-btn" data-source="${s.type}">
              <span class="source-name">${s.name}</span>
              <span class="source-status">${s.status}</span>
            </button>
          `,
            )
            .join("")}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.classList.remove("hidden");

  modal.querySelector("#close-capture-modal").addEventListener("click", () => {
    modal.remove();
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });

  modal.querySelectorAll(".capture-source-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      createCaptureJob(btn.dataset.source);
      modal.remove();
    });
  });
}

function getSourceDisplayName(sourceType) {
  const names = {
    flights: "Live Flights",
    earthquakes: "Earthquakes",
    satellites: "Satellites",
    weather: "Weather",
    bikeshare: "Bikeshare",
    traffic: "Traffic",
    cctv: "CCTV",
    alerts: "Alerts",
    events: "Events",
  };
  return names[sourceType] || sourceType;
}

function renderCorrelationTimeline() {
  clearIncidentTimelineEntities();

  const timeline = incidentState.timeline;
  const markers = incidentState.markers;

  if (!timeline || markers.length === 0) {
    return;
  }

  for (const marker of markers) {
    if (!marker.lon || !marker.lat) continue;

    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(marker.lon, marker.lat, 0),
      point: {
        pixelSize: getMarkerSize(marker.type),
        color: Cesium.Color.fromCssColorString(getMarkerColor(marker)),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
      },
      label: {
        text: getMarkerLabel(marker),
        font: "9px monospace",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -12),
        show: false,
      },
      properties: {
        type: "incident_marker",
        marker: marker,
      },
    });

    incidentState.entities?.set(marker.event_id || marker.id, entity);
  }
}

function getMarkerSize(type) {
  switch (type) {
    case "earthquake":
      return 14;
    case "alert":
      return 12;
    case "weather":
      return 10;
    case "satellite":
      return 8;
    case "traffic":
      return 8;
    case "bikeshare":
      return 6;
    case "source_health":
      return 5;
    default:
      return 8;
  }
}

function getMarkerColor(marker) {
  switch (marker.type) {
    case "alert":
      return marker.severity === "critical"
        ? "#ef4444"
        : marker.severity === "high"
          ? "#f97316"
          : "#eab308";
    case "earthquake": {
      const mag = marker.magnitude || 3;
      if (mag >= 5) return "#ef4444";
      if (mag >= 3) return "#f97316";
      if (mag >= 1) return "#eab308";
      return "#22c55e";
    }
    case "weather":
      return marker.severity === "Extreme"
        ? "#dc2626"
        : marker.severity === "Severe"
          ? "#ea580c"
          : "#eab308";
    case "traffic":
      return marker.severity === "blocking"
        ? "#dc2626"
        : marker.severity === "major"
          ? "#ea580c"
          : "#eab308";
    case "satellite":
      return "#3b82f6";
    case "bikeshare":
      return "#22c55e";
    case "source_health":
      return marker.status === "active" ? "#22c55e" : "#6b7280";
    default:
      return "#6b7280";
  }
}

function getMarkerLabel(marker) {
  switch (marker.type) {
    case "alert":
      return `ALERT: ${marker.severity}`;
    case "earthquake":
      return `M${marker.magnitude}`;
    case "weather":
      return marker.severity || "WEATHER";
    case "traffic":
      return marker.type || "TRAFFIC";
    case "satellite":
      return marker.name || "SAT";
    case "bikeshare":
      return `${marker.availability || 0}%`;
    default:
      return marker.type || "";
  }
}

function setIncidentSection(section) {
  incidentState.playback.section = section;

  dom.btnBefore.classList.remove("active");
  dom.btnDuring.classList.remove("active");
  dom.btnAfter.classList.remove("active");

  switch (section) {
    case "before":
      dom.btnBefore.classList.add("active");
      break;
    case "during":
      dom.btnDuring.classList.add("active");
      break;
    case "after":
      dom.btnAfter.classList.add("active");
      break;
  }
}

function jumpToIncidentTime(timestamp) {
  if (!incidentState.currentIncident) return;

  const incident = incidentState.currentIncident;
  const startTime = new Date(incident.start_at).getTime();
  const endTime = new Date(incident.end_at).getTime();
  const targetTime = timestamp.getTime();

  if (targetTime < startTime) {
    setIncidentSection("before");
  } else if (targetTime > endTime) {
    setIncidentSection("after");
  } else {
    setIncidentSection("during");
  }

  incidentState.playback.currentTime = timestamp;
  updateIncidentScrubber();
  updateIncidentView();
}

function updateIncidentScrubber() {
  if (!incidentState.currentIncident) return;

  const incident = incidentState.currentIncident;
  const startTime = new Date(incident.start_at).getTime();
  const endTime = new Date(incident.end_at).getTime();
  const currentTime = incidentState.playback.currentTime?.getTime() || startTime;

  const progress = Math.max(
    0,
    Math.min(100, ((currentTime - startTime) / (endTime - startTime)) * 100),
  );
  dom.incidentScrubber.value = String(progress);
}

function updateIncidentView() {
  if (!incidentState.currentIncident || !incidentState.playback.currentTime) return;

  const currentTime = incidentState.playback.currentTime;

  highlightMarkersAtTime(currentTime);

  const activeChapter = incidentState.chapters.find((chapter, index, chapters) => {
    const chapterTime = new Date(chapter.timestamp).getTime();
    const nextChapter = chapters[index + 1];
    const nextTime = nextChapter ? new Date(nextChapter.timestamp).getTime() : Infinity;
    return currentTime.getTime() >= chapterTime && currentTime.getTime() < nextTime;
  });

  if (activeChapter) {
    dom.incidentChapters.querySelectorAll(".chapter-marker").forEach((marker) => {
      marker.classList.toggle("active", marker.dataset.chapterId === activeChapter.chapter_id);
    });
  }
}

function highlightMarkersAtTime(timestamp) {
  if (!incidentState.timeline) return;

  const targetTime = timestamp.getTime();
  const toleranceMs = 60000;

  for (const [, entity] of incidentState.entities || []) {
    if (!entity.properties?.marker) continue;

    const marker = entity.properties.marker.getValue();
    if (!marker) continue;

    const markerTime = new Date(marker.timestamp).getTime();
    const isRelevant = Math.abs(markerTime - targetTime) <= toleranceMs;

    if (entity.point) {
      entity.point.show = isRelevant;
    }
    if (entity.label) {
      entity.label.show = isRelevant;
    }
  }
}

function playIncident() {
  if (!incidentState.currentIncident) return;

  stopIncidentPlayback();

  incidentState.playback.isPlaying = true;
  dom.incidentPlay.style.display = "none";
  dom.incidentPause.style.display = "flex";

  const baseIntervalMs = 1000;
  const speed = incidentState.playback.speed;
  const intervalMs = baseIntervalMs / speed;

  incidentState.playback.intervalId = setInterval(() => {
    const incident = incidentState.currentIncident;
    const currentTime = incidentState.playback.currentTime || new Date(incident.start_at);
    const endTime = new Date(incident.end_at);

    const newTime = new Date(currentTime.getTime() + 1000);
    incidentState.playback.currentTime = newTime;

    if (newTime >= endTime) {
      stopIncidentPlayback();
      return;
    }

    if (newTime < new Date(incident.start_at)) {
      setIncidentSection("before");
    } else if (newTime > new Date(incident.end_at)) {
      setIncidentSection("after");
    } else {
      setIncidentSection("during");
    }

    updateIncidentScrubber();
    updateIncidentView();
  }, intervalMs);
}

function pauseIncident() {
  stopIncidentPlayback();
}

function stopIncidentPlayback() {
  if (incidentState.playback.intervalId) {
    clearInterval(incidentState.playback.intervalId);
    incidentState.playback.intervalId = null;
  }
  incidentState.playback.isPlaying = false;
  dom.incidentPlay.style.display = "flex";
  dom.incidentPause.style.display = "none";
}

function setIncidentSpeed(speed) {
  incidentState.playback.speed = parseFloat(speed);
  if (incidentState.playback.isPlaying) {
    playIncident();
  }
}

function focusOnAOI(aoi) {
  const points = getAoiCoordinatePairs(aoi);
  if (points.length === 0) return;

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;

  for (const [lon, lat] of points) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const spanLon = maxLon - minLon;
  const spanLat = maxLat - minLat;
  const maxSpan = Math.max(spanLon, spanLat);
  const height = Math.max(maxSpan * 111000 * 2, 5000);

  focusMapOnLocation(centerLat, centerLon, height);
}

async function createIncident() {
  const title = dom.incidentTitleInput.value.trim();
  const description = dom.incidentDescInput.value.trim();
  const startAt = dom.incidentStartInput.value;
  const endAt = dom.incidentEndInput.value;
  const severity = dom.incidentSeverityInput.value;
  const tags = dom.incidentTagsInput.value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  if (!title || !startAt || !endAt || !severity) {
    alert("Please fill in all required fields");
    return;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/incidents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        title,
        description,
        start_at: new Date(startAt).toISOString(),
        end_at: new Date(endAt).toISOString(),
        severity,
        tags,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      alert(`Failed to create incident: ${error.message || error.error}`);
      return;
    }

    hideNewIncidentForm();
    renderIncidentList();
    updateStatus("INCIDENT CREATED");
  } catch (error) {
    console.error("Failed to create incident:", error);
    alert("Failed to create incident");
  }
}

async function showAlertDetail(alertId, options = {}) {
  try {
    currentAlertId = alertId;
    const response = await fetch(`${apiBaseUrl}/alerts/${alertId}`, {
      headers: getAuthHeaders(),
    });

    if (handleUnauthorized(response)) {
      alert("Session expired. Please login again.");
      return;
    }

    const alertData = await response.json();

    const evidenceObjects = alertData.evidence_object_ids?.join(", ") || "None";

    let triggeringEventsHtml = "";
    if (alertData.evidence_event_ids && alertData.evidence_event_ids.length > 0) {
      triggeringEventsHtml = `<div class="alert-event-list">
        ${alertData.evidence_event_ids
          .map(
            (eventId) => `
              <button class="alert-event-link" data-event-id="${eventId}">${eventId}</button>
            `,
          )
          .join("")}
      </div>`;
    } else {
      triggeringEventsHtml = "<p>None</p>";
    }

    dom.alertDetailContent.innerHTML = `
      <div class="alert-detail-summary">${alertData.summary}</div>
      <div class="alert-detail-meta">
        <span class="alert-severity ${alertData.severity}">${alertData.severity}</span>
        <span class="alert-status ${alertData.status}">${alertData.status}</span>
      </div>
      <div class="alert-detail-section">
        <div class="alert-detail-label">Explanation</div>
        <div class="alert-detail-value">${alertData.explanation}</div>
      </div>
      <div class="alert-detail-section">
        <div class="alert-detail-label">Rule</div>
        <div class="alert-detail-value">${alertData.rule_id}</div>
      </div>
      <div class="alert-detail-section">
        <div class="alert-detail-label">Triggering Events</div>
        ${triggeringEventsHtml}
      </div>
      <div class="alert-detail-section">
        <div class="alert-detail-label">Related Objects</div>
        <div class="alert-detail-value">${evidenceObjects}</div>
      </div>
      <div class="alert-detail-section">
        <div class="alert-detail-label">Opened</div>
        <div class="alert-detail-value">${new Date(alertData.opened_at).toLocaleString()}</div>
      </div>
      ${
        alertData.acknowledged_at
          ? `
          <div class="alert-detail-section">
            <div class="alert-detail-label">Acknowledged</div>
            <div class="alert-detail-value">${new Date(alertData.acknowledged_at).toLocaleString()}</div>
          </div>
          `
          : ""
      }
    `;
    dom.alertDetailContent.insertAdjacentHTML("beforeend", renderSwanInsights("alert", alertId));

    // Add event click handlers
    dom.alertDetailContent.querySelectorAll(".alert-event-link").forEach((btn) => {
      btn.addEventListener("click", () => {
        showEventDetail(btn.dataset.eventId);
      });
    });

    // Build actions
    let actionsHtml = "";

    if (canManageAlerts() && alertData.status !== "closed") {
      if (alertData.status === "open") {
        actionsHtml += `<button type="button" class="alert-action-btn acknowledge" id="ack-alert">ACKNOWLEDGE</button>`;
      }
      actionsHtml += `<button type="button" class="alert-action-btn close" id="close-alert-btn">CLOSE</button>`;
    }

    if (alertData.evidence_object_ids && alertData.evidence_object_ids.length > 0) {
      actionsHtml += `<button type="button" class="alert-action-btn jump" id="jump-replay">JUMP TO REPLAY</button>`;
    }

    if (sessionState.isAuthenticated) {
      actionsHtml += `<button type="button" class="alert-action-btn link" id="link-incident">LINK TO INCIDENT</button>`;
    }

    actionsHtml += `<button class="alert-action-btn back" id="back-alerts">BACK</button>`;

    dom.alertActions.innerHTML = actionsHtml;

    // Add action handlers
    if (document.getElementById("ack-alert")) {
      document
        .getElementById("ack-alert")
        .addEventListener("click", () => acknowledgeAlert(alertId));
    }
    if (document.getElementById("close-alert-btn")) {
      document
        .getElementById("close-alert-btn")
        .addEventListener("click", () => closeAlert(alertId));
    }
    if (document.getElementById("jump-replay")) {
      document
        .getElementById("jump-replay")
        .addEventListener("click", () => jumpToReplayFromAlert(alertData));
    }
    if (document.getElementById("link-incident")) {
      document
        .getElementById("link-incident")
        .addEventListener("click", () => showLinkIncidentModal(alertId));
    }
    document.getElementById("back-alerts").addEventListener("click", () => {
      currentAlertId = null;
      dom.alertModal.classList.add("hidden");
    });

    dom.alertModal.classList.remove("hidden");
    if (options.emitActivity !== false) {
      emitSwanActivity("alert_opened", {
        targetType: "alert",
        targetId: alertId,
        context: {
          alert_summary: alertData.summary,
          alert_status: alertData.status,
        },
      });
    }
  } catch (error) {
    console.error("Failed to load alert detail:", error);
  }
}

function jumpToReplayFromAlert(alert) {
  if (alert.evidence_object_ids && alert.evidence_object_ids.length > 0) {
    const objectId = alert.evidence_object_ids[0];
    const openedAt = new Date(alert.opened_at);
    const startTime = new Date(openedAt.getTime() - 5 * 60 * 1000);
    const endTime = new Date(openedAt.getTime() + 5 * 60 * 1000);

    dom.startAt.value = startTime.toISOString();
    dom.endAt.value = endTime.toISOString();
    dom.objectId.value = objectId;

    switchToReplayMode();
    dom.alertModal.classList.add("hidden");
    dom.queryModal.classList.remove("hidden");
    updateStatus("REPLAY WINDOW READY");
  }
}

async function closeAlert(alertId) {
  if (!canManageAlerts()) {
    alert("You must be logged in as an operator to close alerts.");
    return;
  }
  try {
    const response = await fetch(`${apiBaseUrl}/alerts/${alertId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ status: "closed" }),
    });
    if (response.ok) {
      dom.alertModal.classList.add("hidden");
      loadAlerts();
    } else if (handleUnauthorized(response)) {
      alert("Session expired. Please login again.");
    } else if (response.status === 403) {
      alert("You don't have permission to close alerts.");
    } else {
      alert("Failed to close alert.");
    }
  } catch (error) {
    alert(`Error closing alert: ${error.message}`);
  }
}

async function acknowledgeAlert(alertId) {
  if (!canManageAlerts()) {
    alert("You must be logged in as an operator to acknowledge alerts.");
    return;
  }
  try {
    const response = await fetch(`${apiBaseUrl}/alerts/${alertId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({ status: "acknowledged" }),
    });
    if (response.ok) {
      showAlertDetail(alertId);
      loadAlerts();
    } else if (handleUnauthorized(response)) {
      alert("Session expired. Please login again.");
    } else if (response.status === 403) {
      alert("You don't have permission to acknowledge alerts.");
    } else {
      alert("Failed to acknowledge alert.");
    }
  } catch (error) {
    alert(`Error acknowledging alert: ${error.message}`);
  }
}

async function showEventDetail(eventId) {
  try {
    updateStatus("LOADING EVENT...");
    const response = await fetch(`${apiBaseUrl}/events/${eventId}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      updateStatus("EVENT NOT FOUND");
      return;
    }

    const event = await response.json();

    // Update alert detail content to show event
    dom.alertDetailContent.innerHTML = `
      <div class="alert-detail-section">
        <div class="alert-detail-label">Event ID</div>
        <div class="alert-detail-value">${event.event_id}</div>
      </div>
      <div class="alert-detail-section">
        <div class="alert-detail-label">Object ID</div>
        <div class="alert-detail-value">${event.object_id}</div>
      </div>
      <div class="alert-detail-section">
        <div class="alert-detail-label">Event Type</div>
        <div class="alert-detail-value">${event.event_type}</div>
      </div>
      <div class="alert-detail-section">
        <div class="alert-detail-label">Observed At</div>
        <div class="alert-detail-value">${new Date(event.observed_at).toLocaleString()}</div>
      </div>
      <div class="alert-detail-section">
        <div class="alert-detail-label">Source</div>
        <div class="alert-detail-value">${event.source_id}</div>
      </div>
      ${
        event.position
          ? `
          <div class="alert-detail-section">
            <div class="alert-detail-label">Position</div>
            <div class="alert-detail-value">${event.position.lat.toFixed(6)}, ${event.position.lon.toFixed(6)}</div>
          </div>
          `
          : ""
      }
      ${
        event.velocity
          ? `
          <div class="alert-detail-section">
            <div class="alert-detail-label">Velocity</div>
            <div class="alert-detail-value">${event.velocity.speed_mps?.toFixed(1) ?? "N/A"} m/s, ${event.velocity.heading_deg?.toFixed(1) ?? "N/A"}°</div>
          </div>
          `
          : ""
      }
    `;

    updateStatus("EVENT LOADED");
  } catch (error) {
    console.error("Failed to load event:", error);
    updateStatus("FAILED TO LOAD EVENT");
  }
}

// ===== VISUAL CONTROLS =====
function applyStylePreset(preset) {
  visualState.preset = preset;
  document.body.setAttribute("data-theme", preset);

  // Update button states
  dom.presetButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.preset === preset);
  });

  renderMapMarkers();
  renderTrack();
}

function updateVisualEffects() {
  visualState.bloom = parseInt(dom.bloomSlider.value, 10);
  visualState.sharpen = parseInt(dom.sharpenSlider.value, 10);
  visualState.pixelate = parseInt(dom.pixelateSlider.value, 10);
  visualState.distortion = parseInt(dom.distortionSlider.value, 10);
  visualState.instability = parseInt(dom.instabilitySlider.value, 10);

  // Update slider value displays
  dom.bloomSlider.nextElementSibling.textContent = `${visualState.bloom}%`;
  dom.sharpenSlider.nextElementSibling.textContent = `${visualState.sharpen}%`;
  dom.pixelateSlider.nextElementSibling.textContent =
    visualState.pixelate === 0 ? "OFF" : `${visualState.pixelate}%`;
  dom.distortionSlider.nextElementSibling.textContent = `${visualState.distortion}%`;
  dom.instabilitySlider.nextElementSibling.textContent = `${visualState.instability}%`;
}

// ===== EVENT LISTENERS =====
function initEventListeners() {
  // Mode switching
  dom.modeLive.addEventListener("click", switchToLiveMode);
  dom.modeReplay.addEventListener("click", switchToReplayMode);

  // Replay controls
  dom.playReplay.addEventListener("click", playReplay);
  dom.pauseReplay.addEventListener("click", pauseReplay);
  dom.stepReplay.addEventListener("click", stepReplay);
  dom.resetReplay.addEventListener("click", resetReplay);

  dom.timelineSlider.addEventListener("input", () => {
    replayState.currentIndex = parseInt(dom.timelineSlider.value, 10) || 0;
    renderReplay();
  });

  // Query modal
  dom.queryFormToggle.addEventListener("click", () => {
    dom.queryModal.classList.remove("hidden");
  });

  dom.closeQuery.addEventListener("click", () => {
    dom.queryModal.classList.add("hidden");
  });

  dom.cancelQuery.addEventListener("click", () => {
    dom.queryModal.classList.add("hidden");
  });

  dom.loadReplayBtn.addEventListener("click", () => {
    loadReplay();
    dom.queryModal.classList.add("hidden");
  });

  dom.loadReplayButton.addEventListener("click", () => {
    loadReplay();
  });

  // Close alert modal
  dom.closeAlert.addEventListener("click", () => {
    currentAlertId = null;
    dom.alertModal.classList.add("hidden");
  });

  // Events panel
  dom.closeEvents.addEventListener("click", () => {
    dom.eventsPanel.classList.add("hidden");
  });

  // Layer toggles
  dom.layerFlights.addEventListener("change", (e) => {
    layerState.flights = e.target.checked;
    updateActiveLayersCount();
    renderMapMarkers();
    renderTrack();
    emitSwanActivity("layer_toggled", {
      targetType: "layer",
      targetId: "flights",
      context: { enabled: e.target.checked },
    });
  });

  dom.layerMilitary.addEventListener("change", (e) => {
    layerState.military = e.target.checked;
    updateActiveLayersCount();
    emitSwanActivity("layer_toggled", {
      targetType: "layer",
      targetId: "military",
      context: { enabled: e.target.checked },
    });
  });

  dom.layerEarthquakes.addEventListener("change", (e) => {
    layerState.earthquakes = e.target.checked;
    updateActiveLayersCount();

    const layer = externalLayerState.layers.get("earthquakes");
    if (layer) {
      layer.enabled = e.target.checked;
      if (e.target.checked) {
        loadExternalLayerData("earthquakes");
      } else {
        clearExternalLayerEntities("earthquakes");
      }
    }
    emitSwanActivity("layer_toggled", {
      targetType: "layer",
      targetId: "earthquakes",
      context: { enabled: e.target.checked },
    });
  });

  dom.layerSatellites.addEventListener("change", (e) => {
    layerState.satellites = e.target.checked;
    updateActiveLayersCount();

    const layer = externalLayerState.layers.get("satellites");
    if (layer) {
      layer.enabled = e.target.checked;
      if (e.target.checked) {
        loadExternalLayerData("satellites");
      } else {
        clearExternalLayerEntities("satellites");
      }
    }
    emitSwanActivity("layer_toggled", {
      targetType: "layer",
      targetId: "satellites",
      context: { enabled: e.target.checked },
    });
  });

  dom.layerTraffic.addEventListener("change", (e) => {
    layerState.traffic = e.target.checked;
    updateActiveLayersCount();

    const layer = externalLayerState.layers.get("traffic");
    if (layer) {
      layer.enabled = e.target.checked;
      if (e.target.checked) {
        loadExternalLayerData("traffic");
      } else {
        clearExternalLayerEntities("traffic");
      }
    }
    emitSwanActivity("layer_toggled", {
      targetType: "layer",
      targetId: "traffic",
      context: { enabled: e.target.checked },
    });
  });

  dom.layerWeather.addEventListener("change", (e) => {
    layerState.weather = e.target.checked;
    updateActiveLayersCount();

    const layer = externalLayerState.layers.get("weather");
    if (layer) {
      layer.enabled = e.target.checked;
      if (e.target.checked) {
        loadExternalLayerData("weather");
      } else {
        clearExternalLayerEntities("weather");
      }
    }
    emitSwanActivity("layer_toggled", {
      targetType: "layer",
      targetId: "weather",
      context: { enabled: e.target.checked },
    });
  });

  dom.layerCctv.addEventListener("change", (e) => {
    layerState.cctv = e.target.checked;
    updateActiveLayersCount();
    if (!e.target.checked) {
      renderCCTVPlaceholder("CCTV layer disabled", "Enable CCTV Mesh layer to view camera data");
    } else if (selectedObjectId) {
      const state =
        currentMode === "live" ? latestStates.get(selectedObjectId) : getCurrentReplayState();
      if (state) {
        updateCCTVSection(selectedObjectId, state);
      }
    } else {
      renderCCTVPlaceholder("No camera selected", "Select a CCTV-linked object to view");
    }
    emitSwanActivity("layer_toggled", {
      targetType: "layer",
      targetId: "cctv",
      context: { enabled: e.target.checked },
    });
  });

  dom.layerBikeshare.addEventListener("change", (e) => {
    layerState.bikeshare = e.target.checked;
    updateActiveLayersCount();

    const layer = externalLayerState.layers.get("bikeshare");
    if (layer) {
      layer.enabled = e.target.checked;
      if (e.target.checked) {
        loadExternalLayerData("bikeshare");
      } else {
        clearExternalLayerEntities("bikeshare");
      }
    }
    emitSwanActivity("layer_toggled", {
      targetType: "layer",
      targetId: "bikeshare",
      context: { enabled: e.target.checked },
    });
  });

  // Inference layer toggles
  dom.layerDegradation.addEventListener("change", (e) => {
    inferenceState.layers.degradation = e.target.checked;
    if (e.target.checked) {
      renderInferenceLayer("degradation");
    } else {
      clearInferenceEntities("degradation");
    }
    updateInferenceCounts();
  });

  dom.layerRedirection.addEventListener("change", (e) => {
    inferenceState.layers.redirection = e.target.checked;
    if (e.target.checked) {
      renderInferenceLayer("redirection");
    } else {
      clearInferenceEntities("redirection");
    }
    updateInferenceCounts();
  });

  dom.layerHolding.addEventListener("change", (e) => {
    inferenceState.layers.holding = e.target.checked;
    if (e.target.checked) {
      renderInferenceLayer("holding");
    } else {
      clearInferenceEntities("holding");
    }
    updateInferenceCounts();
  });

  dom.layerAbsence.addEventListener("change", (e) => {
    inferenceState.layers.absence = e.target.checked;
    if (e.target.checked) {
      renderInferenceLayer("absence");
    } else {
      clearInferenceEntities("absence");
    }
    updateInferenceCounts();
  });

  // URL sync on layer changes
  document.getElementById("layers-list")?.addEventListener("change", () => {
    syncStateToUrl();
  });

  // Style presets
  dom.presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      applyStylePreset(btn.dataset.preset);
    });
  });

  dom.surfaceButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setMapSurface(btn.dataset.surface);
    });
  });

  // Visual sliders
  [
    dom.bloomSlider,
    dom.sharpenSlider,
    dom.pixelateSlider,
    dom.distortionSlider,
    dom.instabilitySlider,
  ].forEach((slider) => {
    slider.addEventListener("input", updateVisualEffects);
  });

  // View mode toggles
  dom.toggleHud.addEventListener("change", (e) => {
    visualState.hud = e.target.checked;
    document.querySelector(".crosshair").style.opacity = visualState.hud ? "0.3" : "0";
    document.querySelector(".coordinates").style.opacity = visualState.hud ? "1" : "0";
    document.querySelector(".zoom-level").style.opacity = visualState.hud ? "1" : "0";
  });

  dom.layoutSelect.addEventListener("change", (e) => {
    visualState.layout = e.target.value;
  });

  dom.toggleDetect.addEventListener("change", (e) => {
    visualState.detect = e.target.checked;
    renderMapMarkers();
    renderTrack();
    if (layerState.satellites) {
      loadExternalLayerData("satellites");
    }
  });

  dom.togglePanoptic.addEventListener("change", (e) => {
    visualState.panoptic = e.target.checked;
    renderMapMarkers();
  });

  // Incident panel events
  dom.closeIncident.addEventListener("click", hideIncidentPanel);

  dom.btnBefore.addEventListener("click", () => setIncidentSection("before"));
  dom.btnDuring.addEventListener("click", () => setIncidentSection("during"));
  dom.btnAfter.addEventListener("click", () => setIncidentSection("after"));

  dom.incidentPlay.addEventListener("click", playIncident);
  dom.incidentPause.addEventListener("click", pauseIncident);

  dom.incidentScrubber.addEventListener("input", () => {
    if (!incidentState.currentIncident) return;

    const incident = incidentState.currentIncident;
    const startTime = new Date(incident.start_at).getTime();
    const endTime = new Date(incident.end_at).getTime();
    const progress = parseInt(dom.incidentScrubber.value, 10) / 100;
    const newTime = new Date(startTime + (endTime - startTime) * progress);

    incidentState.playback.currentTime = newTime;

    if (newTime < new Date(incident.start_at)) {
      setIncidentSection("before");
    } else if (newTime > new Date(incident.end_at)) {
      setIncidentSection("after");
    } else {
      setIncidentSection("during");
    }

    updateIncidentView();
  });

  dom.incidentSpeed.addEventListener("change", (e) => {
    setIncidentSpeed(e.target.value);
  });

  // Incident modal events
  dom.closeIncidentModal.addEventListener("click", hideIncidentModal);
  dom.btnNewIncident.addEventListener("click", showNewIncidentForm);

  dom.btnAddCapture.addEventListener("click", showCaptureSourceModal);
  dom.btnRefreshIncidentIntelligence?.addEventListener("click", refreshIncidentIntelligenceBundle);
  dom.closeNewIncidentModal.addEventListener("click", hideNewIncidentForm);
  dom.btnCancelIncident.addEventListener("click", hideNewIncidentForm);
  dom.btnCreateIncident.addEventListener("click", createIncident);
}

// Make handleAuthClick available globally for onclick handler
window.handleAuthClick = handleAuthClick;
window.selectObject = selectObject;

// ===== EXTERNAL DATA LAYERS =====
async function loadExternalLayers() {
  try {
    const response = await fetch(`${apiBaseUrl}/layers`);
    if (!response.ok) return;

    const layers = await response.json();

    // Update external layer state
    for (const layer of layers) {
      const existing = externalLayerState.layers.get(layer.layer_id);
      externalLayerState.layers.set(layer.layer_id, {
        ...layer,
        enabled: existing?.enabled ?? layerState[layer.layer_id] ?? layer.enabled,
      });
    }

    // Update UI
    updateLayerRailUI();

    for (const [layerId, layer] of externalLayerState.layers) {
      if (layer.enabled) {
        loadExternalLayerData(layerId);
      } else {
        clearExternalLayerEntities(layerId);
      }
    }
  } catch (error) {
    console.error("Failed to load external layers:", error);
  }
}

async function loadExternalLayerData(layerId) {
  if (!externalLayerState.layers.get(layerId)?.enabled) return;

  const breaker = getLayerCircuitBreaker(layerId);
  if (breaker.isOpen()) {
    const statusEl = document.getElementById(`layer-status-${layerId}`);
    if (statusEl) {
      statusEl.textContent = "TRIPPED";
      statusEl.className = "layer-status degraded";
    }
    console.warn(`[CircuitBreaker] Skipping ${layerId} fetch (circuit open)`);
    return;
  }

  await breaker.execute(async () => {
    const response = await fetch(
      `${apiBaseUrl}/layers/${layerId}/data${getExternalLayerBoundsQuery()}`,
    );
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    renderExternalLayerData(layerId, data);
  }, null);
}

function renderExternalLayerData(layerId, data) {
  const cache = new Map();
  for (const event of data.events || []) {
    cache.set(getExternalLayerEventKey(event), event);
  }
  externalLayerState.eventCache.set(layerId, cache);

  if (layerId !== "satellites") {
    clearExternalLayerEntities(layerId);
  }

  switch (layerId) {
    case "earthquakes":
      renderEarthquakes(data.events || []);
      break;
    case "satellites":
      renderSatellites(data.events || []);
      break;
    case "weather":
      renderWeather(data.events || []);
      break;
    case "bikeshare":
      renderBikeshare(data.events || []);
      break;
    case "traffic":
      renderTraffic(data.events || []);
      break;
    default:
      console.warn(`Unknown layer type: ${layerId}`);
  }

  const layer = externalLayerState.layers.get(layerId);
  if (layer) {
    layer.count = typeof data.count === "number" ? data.count : layer.count;
    layer.lastUpdate = data.last_update ?? layer.lastUpdate;
    layer.status = data.status ?? layer.status;
    layer.errorMessage = data.error_message ?? null;
    if (typeof data.total_count === "number") {
      layer.totalCount = data.total_count;
    }
    updateLayerRailUI();
  }
}

function clearExternalLayerEntities(layerId) {
  const entities = externalLayerState.entities.get(layerId);
  if (entities) {
    for (const entity of entities.values()) {
      viewer.entities.remove(entity);
    }
    entities.clear();
  } else {
    externalLayerState.entities.set(layerId, new Map());
  }
}

function renderEarthquakes(events) {
  const entities = externalLayerState.entities.get("earthquakes") || new Map();

  for (const event of events) {
    const magnitude = event.payload?.magnitude || 0;
    const color = getEarthquakeColor(magnitude);
    const size = getEarthquakeSize(magnitude);

    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(event.lon, event.lat, 0),
      ellipse: {
        semiMinorAxis: size,
        semiMajorAxis: size,
        material: Cesium.Color.fromCssColorString(color).withAlpha(0.6),
        outline: true,
        outlineColor: Cesium.Color.fromCssColorString(color),
        outlineWidth: 2,
      },
      label: {
        text: `M${magnitude.toFixed(1)}`,
        font: "12px monospace",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -size),
      },
      properties: {
        type: "earthquake",
        event: event,
      },
    });

    entities.set(event.event_id, entity);
  }

  externalLayerState.entities.set("earthquakes", entities);
}

function getEarthquakeColor(magnitude) {
  if (magnitude < 4.0) return "#4ade80"; // Green
  if (magnitude < 6.0) return "#facc15"; // Yellow
  if (magnitude < 7.0) return "#fb923c"; // Orange
  return "#ef4444"; // Red
}

function getEarthquakeSize(magnitude) {
  return 10000 + magnitude * 5000; // meters
}

function renderSatellites(events) {
  const entities = externalLayerState.entities.get("satellites") || new Map();
  const sparseStride = visualState.detect ? 1 : Math.max(4, Math.ceil(events.length / 120));
  const nextKeys = new Set();
  let index = 0;

  for (const event of events) {
    const type = event.payload?.type || "unknown";
    const style = getSatelliteStyle(type);
    const altitudeM = event.altitude_m || 400000;
    const isSelected = selectedSatelliteId === (event.external_id || event.payload?.noradId);
    const showLabel = isSelected || index % sparseStride === 0;

    const entityKey = String(event.external_id || event.payload?.noradId || event.event_id);
    const spec = {
      position: Cesium.Cartesian3.fromDegrees(event.lon, event.lat, altitudeM),
      point: {
        pixelSize: isSelected ? style.pixelSize + 3 : style.pixelSize,
        color: Cesium.Color.fromCssColorString(style.color),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
      },
      label: {
        text: `${event.payload?.name || event.external_id}\nNORAD ${event.payload?.noradId || event.external_id}`,
        font: "10px monospace",
        fillColor: Cesium.Color.fromCssColorString(style.color),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -style.pixelSize - 5),
        show: showLabel,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
          0,
          visualState.detect ? 20_000_000 : 4_500_000,
        ),
      },
      properties: {
        type: "satellite",
        event: event,
      },
    };

    const existing = entities.get(entityKey);
    if (existing) {
      existing.position = spec.position;
      existing.point = spec.point;
      existing.label = spec.label;
      existing.properties = spec.properties;
    } else {
      entities.set(entityKey, viewer.entities.add(spec));
    }
    nextKeys.add(entityKey);
    index += 1;
  }

  for (const [entityKey, entity] of entities) {
    if (nextKeys.has(entityKey)) {
      continue;
    }
    viewer.entities.remove(entity);
    entities.delete(entityKey);
  }

  externalLayerState.entities.set("satellites", entities);
}

function getSatelliteStyle(type) {
  switch (type) {
    case "space_station":
      return { color: "#fbbf24", pixelSize: 12 };
    case "starlink":
      return { color: "#60a5fa", pixelSize: 6 };
    case "geo":
      return { color: "#a78bfa", pixelSize: 8 };
    case "leo":
      return { color: "#34d399", pixelSize: 6 };
    default:
      return { color: "#9ca3af", pixelSize: 5 };
  }
}

function renderWeather(events) {
  const entities = externalLayerState.entities.get("weather") || new Map();

  for (const event of events) {
    const severity = event.payload?.severity || "Unknown";
    const color = getWeatherColor(severity);

    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(event.lon, event.lat, 0),
      point: {
        pixelSize: 10,
        color: Cesium.Color.fromCssColorString(color).withAlpha(0.8),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
      },
      label: {
        text: event.payload?.event || "Weather Alert",
        font: "10px monospace",
        fillColor: Cesium.Color.fromCssColorString(color),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -15),
        show: false,
      },
      properties: {
        type: "weather",
        event: event,
      },
    });

    entities.set(event.event_id, entity);
  }

  externalLayerState.entities.set("weather", entities);
}

function getWeatherColor(severity) {
  switch (severity) {
    case "Extreme":
      return "#dc2626";
    case "Severe":
      return "#ea580c";
    case "Moderate":
      return "#eab308";
    case "Minor":
      return "#3b82f6";
    default:
      return "#6b7280";
  }
}

function renderBikeshare(events) {
  const entities = externalLayerState.entities.get("bikeshare") || new Map();

  for (const event of events) {
    const availability = event.payload?.availabilityPercent || 0;
    const color = getBikeshareColor(availability);
    const size = getBikeshareSize(event.payload?.totalSlots || 10);

    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(event.lon, event.lat, 0),
      point: {
        pixelSize: size,
        color: Cesium.Color.fromCssColorString(color),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
      },
      label: {
        text: `${event.payload?.freeBikes || 0}`,
        font: "10px monospace",
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        show: false,
      },
      properties: {
        type: "bikeshare",
        event: event,
      },
    });

    entities.set(event.event_id, entity);
  }

  externalLayerState.entities.set("bikeshare", entities);
}

function getBikeshareColor(availability) {
  if (availability >= 50) return "#22c55e";
  if (availability >= 25) return "#eab308";
  if (availability > 0) return "#f97316";
  return "#ef4444";
}

function getBikeshareSize(totalSlots) {
  if (totalSlots >= 40) return 12;
  if (totalSlots >= 20) return 10;
  if (totalSlots >= 10) return 8;
  return 6;
}

function renderTraffic(events) {
  const entities = externalLayerState.entities.get("traffic") || new Map();

  for (const event of events) {
    const severity = event.payload?.severity || "unknown";
    const color = getTrafficColor(severity);

    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(event.lon, event.lat, 0),
      point: {
        pixelSize: 8,
        color: Cesium.Color.fromCssColorString(color),
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 1,
      },
      label: {
        text: event.payload?.type || "Traffic",
        font: "9px monospace",
        fillColor: Cesium.Color.fromCssColorString(color),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        pixelOffset: new Cesium.Cartesian2(0, -10),
        show: false,
      },
      properties: {
        type: "traffic",
        event: event,
      },
    });

    entities.set(event.event_id, entity);
  }

  externalLayerState.entities.set("traffic", entities);
}

function getTrafficColor(severity) {
  switch (severity.toLowerCase()) {
    case "blocking":
      return "#dc2626";
    case "major":
      return "#ea580c";
    case "minor":
      return "#eab308";
    default:
      return "#6b7280";
  }
}

function updateLayerRailUI() {
  // Update layer rows with current status
  for (const [layerId, layer] of externalLayerState.layers) {
    const statusEl = document.getElementById(`layer-status-${layerId}`);
    const countEl = document.getElementById(`layer-count-${layerId}`);
    const providerEl = document.getElementById(`layer-provider-${layerId}`);
    const updateEl = document.getElementById(`layer-update-${layerId}`);

    if (statusEl) {
      const statusColors = {
        real: "#22c55e",
        degraded: "#f59e0b",
        unavailable: "#ef4444",
      };
      statusEl.style.color = statusColors[layer.status] || "#6b7280";
      statusEl.textContent = layer.status.toUpperCase();
      statusEl.classList.remove("real", "degraded", "unavailable");
      if (layer.status) {
        statusEl.classList.add(layer.status);
      }
    }

    if (countEl) {
      countEl.textContent = layer.count !== null ? String(layer.count) : "--";
    }

    if (providerEl) {
      providerEl.textContent = layer.provider || "--";
    }

    if (updateEl) {
      updateEl.textContent = formatRelativeAge(layer.lastUpdate);
    }
  }
}

// ===== INFERRED INTELLIGENCE =====
async function loadInferences(incidentId = null) {
  try {
    const url = incidentId
      ? `${apiBaseUrl}/inferences?incident_id=${incidentId}`
      : `${apiBaseUrl}/inferences`;
    const response = await fetch(url);
    if (!response.ok) return;

    const data = await response.json();
    const inferences = data.inferences || data;

    inferenceState.inferences = Array.isArray(inferences) ? inferences : [];
    inferenceState.degradationZones = [];
    inferenceState.routeRedirections = [];
    inferenceState.holdingPatterns = [];

    for (const inference of inferenceState.inferences) {
      const type = getInferenceType(inference);
      switch (type) {
        case "navigation_degradation":
        case "nav_degradation":
        case "degradation":
          inferenceState.degradationZones.push(inference);
          break;
        case "route_redirection":
        case "redirection":
          inferenceState.routeRedirections.push(inference);
          break;
        case "holding_pattern":
        case "holding":
          inferenceState.holdingPatterns.push(inference);
          break;
        case "absence_signal":
        case "absence":
          break;
      }
    }

    updateInferenceCounts();
    renderInferenceList();
  } catch (error) {
    console.error("Failed to load inferences:", error);
  }
}

function getInferenceType(inference) {
  return inference.type || inference.inference_type || "unknown";
}

function getInferenceConfidenceDisplay(inference) {
  const confidenceLevel =
    inference.confidence_level ||
    (typeof inference.confidence === "string" ? inference.confidence : null);

  if (confidenceLevel === "very_high" || confidenceLevel === "high") {
    return { className: "high", label: "HIGH" };
  }
  if (confidenceLevel === "medium") {
    return { className: "medium", label: "MED" };
  }
  if (confidenceLevel === "low") {
    return { className: "low", label: "LOW" };
  }

  if (typeof inference.confidence === "number") {
    if (inference.confidence >= 0.7) {
      return { className: "high", label: "HIGH" };
    }
    if (inference.confidence >= 0.5) {
      return { className: "medium", label: "MED" };
    }
  }

  return { className: "low", label: "LOW" };
}

function updateInferenceCounts() {
  const degradationCount = inferenceState.degradationZones.length;
  const redirectionCount = inferenceState.routeRedirections.length;
  const holdingCount = inferenceState.holdingPatterns.length;
  const absenceCount = inferenceState.inferences.filter((inference) => {
    const type = getInferenceType(inference);
    return type === "absence_signal" || type === "absence";
  }).length;

  dom.degradationCount.textContent = degradationCount;
  dom.redirectionCount.textContent = redirectionCount;
  dom.holdingCount.textContent = holdingCount;
  dom.absenceCount.textContent = absenceCount;

  const total = degradationCount + redirectionCount + holdingCount + absenceCount;
  dom.inferenceCount.textContent = total;
}

function renderInferenceList() {
  if (inferenceState.inferences.length === 0) {
    dom.inferenceList.innerHTML = '<div class="inference-empty">No inferences detected</div>';
    return;
  }

  dom.inferenceList.innerHTML = inferenceState.inferences
    .map((inference) => {
      const type = getInferenceType(inference);
      const confidenceDisplay = getInferenceConfidenceDisplay(inference);
      const time = inference.detected_at || inference.created_at || "";
      const description = inference.description || inference.summary || `Detected ${type}`;
      const evidence = inference.evidence_summary ? inference.evidence_summary : "";

      return `
        <div class="inference-item ${type.replace("_", "")}" data-inference-id="${inference.inference_id || inference.id}">
          <div class="inference-item-header">
            <span class="inference-item-type">${type.replace("_", " ")}</span>
            <span class="inference-item-confidence ${confidenceDisplay.className}">${confidenceDisplay.label}</span>
          </div>
          <div class="inference-item-description">${description}</div>
          ${evidence ? `<div class="inference-item-evidence">Evidence: ${evidence}</div>` : ""}
          ${time ? `<div class="inference-item-time">${new Date(time).toLocaleString()}</div>` : ""}
      </div>
    `;
    })
    .join("");

  dom.inferenceList.querySelectorAll(".inference-item").forEach((item) => {
    item.addEventListener("click", () => {
      const inferenceId = item.dataset.inferenceId;
      const inference = inferenceState.inferences.find(
        (i) => (i.inference_id || i.id) === inferenceId,
      );
      if (inference) {
        flyToInference(inference);
      }
    });
  });
}

function flyToInference(inference) {
  if (!viewer || !inference.location) return;

  const location = inference.location;
  if (location.latitude !== undefined && location.longitude !== undefined) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(location.longitude, location.latitude, 5000),
      duration: 1.5,
    });
  }
}

function renderInferenceLayer(layerType) {
  if (!viewer) return;

  let inferences = [];
  switch (layerType) {
    case "degradation":
      inferences = inferenceState.degradationZones;
      break;
    case "redirection":
      inferences = inferenceState.routeRedirections;
      break;
    case "holding":
      inferences = inferenceState.holdingPatterns;
      break;
    case "absence":
      inferences = inferenceState.inferences.filter((inference) => {
        const type = getInferenceType(inference);
        return type === "absence_signal" || type === "absence";
      });
      break;
    default:
      return;
  }

  const colors = {
    degradation: Cesium.Color.fromCssColorString("#f59e0b"),
    redirection: Cesium.Color.fromCssColorString("#3399ff"),
    holding: Cesium.Color.fromCssColorString("#9b59b6"),
    absence: Cesium.Color.fromCssColorString("#ef4444"),
  };

  for (const inference of inferences) {
    const id = `inference-${layerType}-${inference.inference_id || inference.id}`;
    if (inferenceState.entities.has(id)) continue;

    if (inference.location && inference.location.latitude !== undefined) {
      const entity = viewer.entities.add({
        id: id,
        position: Cesium.Cartesian3.fromDegrees(
          inference.location.longitude,
          inference.location.latitude,
          100,
        ),
        point: {
          pixelSize: 12,
          color: colors[layerType].withAlpha(0.8),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        },
        description: `
          <div style="font-family: monospace; padding: 10px;">
            <h3 style="margin: 0 0 8px 0; color: #00ff41;">${(inference.type || layerType).toUpperCase()}</h3>
            <p style="margin: 4px 0;"><strong>Confidence:</strong> ${(inference.confidence || "unknown").toUpperCase()}</p>
            <p style="margin: 4px 0;"><strong>Description:</strong> ${inference.description || "N/A"}</p>
            ${inference.evidence ? `<p style="margin: 4px 0;"><strong>Evidence:</strong> ${Array.isArray(inference.evidence) ? inference.evidence.join(", ") : inference.evidence}</p>` : ""}
          </div>
        `,
      });
      inferenceState.entities.set(id, entity);
    }

    if (inference.zone?.coordinates) {
      const coords = inference.zone.coordinates;
      const positions = [];
      if (Array.isArray(coords[0])) {
        for (const pair of coords) {
          positions.push(Cesium.Cartesian3.fromDegrees(pair[0], pair[1]));
        }
      } else if (coords.length >= 2) {
        positions.push(Cesium.Cartesian3.fromDegrees(coords[0], coords[1]));
      }

      if (positions.length >= 3) {
        const entity = viewer.entities.add({
          id: `inference-zone-${layerType}-${inference.inference_id || inference.id}`,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            material: colors[layerType].withAlpha(0.3),
            outline: true,
            outlineColor: colors[layerType],
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
        });
        inferenceState.entities.set(
          `inference-zone-${layerType}-${inference.inference_id || inference.id}`,
          entity,
        );
      }
    }
  }
}

function clearInferenceEntities(layerType) {
  for (const [id, entity] of inferenceState.entities) {
    if (id.startsWith(`inference-${layerType}`) || id.startsWith(`inference-zone-${layerType}`)) {
      viewer.entities.remove(entity);
      inferenceState.entities.delete(id);
    }
  }
}

function _clearAllInferenceEntities() {
  for (const [_id, entity] of inferenceState.entities) {
    viewer.entities.remove(entity);
  }
  inferenceState.entities.clear();
}

// ===== LOCATION SEARCH =====
let searchAbortController = null;

function parseCoordinates(input) {
  // Match patterns like: "40.7128, -74.0060" or "40.7128 -74.0060" or "40.7128,-74.0060"
  const coordRegex = /^\s*(-?\d+(?:\.\d+)?)\s*[,\s]+\s*(-?\d+(?:\.\d+)?)\s*$/;
  const match = input.trim().match(coordRegex);
  if (!match) return null;
  const lat = Number.parseFloat(match[1]);
  const lon = Number.parseFloat(match[2]);
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return { lat, lon, name: `${lat.toFixed(4)}, ${lon.toFixed(4)}` };
}

async function geocodeWithNominatim(query, signal) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "8");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url.toString(), {
    headers: { "Accept-Language": "en" },
    signal,
  });
  if (!response.ok) throw new Error("Geocoding failed");
  const data = await response.json();
  return data.map((item) => ({
    lat: Number.parseFloat(item.lat),
    lon: Number.parseFloat(item.lon),
    name: item.display_name.split(",")[0],
    detail: item.display_name,
    type: item.type,
  }));
}

function renderSearchResults(results) {
  const container = document.getElementById("viewport-search-results");
  if (!container) return;

  if (results.length === 0) {
    container.innerHTML = '<div class="search-empty">No results found</div>';
    container.classList.remove("hidden");
    return;
  }

  container.innerHTML = results
    .map(
      (r) => `
    <div class="search-result-item" data-lat="${r.lat}" data-lon="${r.lon}">
      <div class="search-result-name">${escapeHtml(r.name)}</div>
      <div class="search-result-meta">${escapeHtml(r.detail || r.type || "")}</div>
      <div class="search-result-coords">${r.lat.toFixed(4)}, ${r.lon.toFixed(4)}</div>
    </div>
  `,
    )
    .join("");

  container.querySelectorAll(".search-result-item").forEach((item) => {
    item.addEventListener("click", () => {
      const lat = Number.parseFloat(item.dataset.lat);
      const lon = Number.parseFloat(item.dataset.lon);
      flyToSearchResult(lat, lon, 2500);
      container.classList.add("hidden");
      document.getElementById("viewport-search-input").value =
        item.querySelector(".search-result-name").textContent;
    });
  });

  container.classList.remove("hidden");
}

function flyToSearchResult(lat, lon, altitude = 2500) {
  if (!viewer || typeof Cesium === "undefined") return;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, altitude),
    duration: 1.5,
  });
  updateStatus(`LOC ${lat.toFixed(3)}, ${lon.toFixed(3)}`);
}

async function handleViewportSearch() {
  const input = document.getElementById("viewport-search-input");
  const container = document.getElementById("viewport-search-results");
  if (!input || !container) return;
  const query = input.value.trim();
  if (!query) {
    container.classList.add("hidden");
    return;
  }

  // Try coordinates first
  const coords = parseCoordinates(query);
  if (coords) {
    flyToSearchResult(coords.lat, coords.lon);
    container.classList.add("hidden");
    return;
  }

  // Geocode via Nominatim
  if (searchAbortController) searchAbortController.abort();
  searchAbortController = new AbortController();

  try {
    const results = await geocodeWithNominatim(query, searchAbortController.signal);
    renderSearchResults(results);
  } catch (error) {
    if (error.name !== "AbortError") {
      renderSearchResults([]);
    }
  }
}

function initViewportSearch() {
  const input = document.getElementById("viewport-search-input");
  const btn = document.getElementById("viewport-search-btn");
  const results = document.getElementById("viewport-search-results");
  if (!input || !btn) return;

  // Debounced input handler
  let debounceTimer = null;
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => handleViewportSearch(), 400);
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleViewportSearch();
    } else if (e.key === "Escape") {
      results.classList.add("hidden");
      input.blur();
    }
  });

  btn.addEventListener("click", () => handleViewportSearch());

  // Keyboard shortcut: / to focus search (only when not typing in another input)
  document.addEventListener("keydown", (e) => {
    const activeTag = document.activeElement?.tagName;
    const isTypingInInput =
      activeTag === "INPUT" ||
      activeTag === "TEXTAREA" ||
      document.activeElement?.isContentEditable;
    if (e.key === "/" && document.activeElement !== input && !isTypingInInput) {
      e.preventDefault();
      input.focus();
    }
  });

  // Close results on outside click
  document.addEventListener("click", (e) => {
    const searchEl = document.getElementById("viewport-search");
    if (searchEl && !searchEl.contains(e.target)) {
      results.classList.add("hidden");
    }
  });
}

// ===== 360° VIEW =====
function getCameraLatLon() {
  if (!viewer || typeof Cesium === "undefined") return null;
  const center = new Cesium.Cartesian2(
    viewer.canvas.clientWidth / 2,
    viewer.canvas.clientHeight / 2,
  );
  const cartesian = viewer.camera.pickEllipsoid(center);
  if (!cartesian) return null;
  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  return {
    lat: Cesium.Math.toDegrees(cartographic.latitude),
    lon: Cesium.Math.toDegrees(cartographic.longitude),
    altitude: cartographic.height,
  };
}

function update360ButtonVisibility() {
  const btn = document.getElementById("viewport-360-btn");
  if (!btn || !viewer || typeof Cesium === "undefined") return;
  const cameraHeight = viewer.camera.positionCartographic?.height ?? Infinity;
  if (cameraHeight < 3000) {
    btn.classList.remove("hidden");
  } else {
    btn.classList.add("hidden");
  }
}

function openPanoramaModal() {
  const pos = getCameraLatLon();
  if (!pos) return;

  const modal = document.getElementById("panorama-modal");
  const container = document.getElementById("panorama-iframe-container");
  const meta = document.getElementById("panorama-meta");
  const googleLink = document.getElementById("panorama-external-google");
  const mapillaryLink = document.getElementById("panorama-external-mapillary");

  if (!modal) return;

  const lat = pos.lat.toFixed(5);
  const lon = pos.lon.toFixed(5);

  // External links
  if (googleLink) {
    googleLink.href = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`;
  }
  if (mapillaryLink) {
    mapillaryLink.href = `https://www.mapillary.com/app/?lat=${lat}&lng=${lon}&z=17&panos=true`;
  }

  // Try Google Street View embed if API key is available
  const streetScene = getStreetSceneConfig();
  if (streetScene.googleApiKey) {
    container.innerHTML = `
      <iframe
        src="https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(streetScene.googleApiKey)}&location=${lat},${lon}"
        allowfullscreen
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
      ></iframe>
    `;
  } else {
    container.innerHTML = `
      <div class="panorama-placeholder">
        <span class="panorama-placeholder-icon">◉</span>
        <span class="panorama-placeholder-text">Street View embed requires a Google Maps API key.</span>
        <span class="panorama-placeholder-text">Use the buttons below to open an external viewer.</span>
      </div>
    `;
  }

  if (meta) {
    meta.textContent = `LAT ${lat}  LON ${lon}  ALT ${Math.round(pos.altitude)}m`;
  }

  modal.classList.remove("hidden");
}

function initPanorama() {
  const btn = document.getElementById("viewport-360-btn");
  const closeBtn = document.getElementById("close-panorama-modal");
  const modal = document.getElementById("panorama-modal");

  if (btn) btn.addEventListener("click", openPanoramaModal);
  if (closeBtn && modal) {
    closeBtn.addEventListener("click", () => modal.classList.add("hidden"));
  }
  if (modal) {
    modal
      .querySelector(".modal-overlay")
      ?.addEventListener("click", () => modal.classList.add("hidden"));
  }

  // Update button visibility on camera change
  if (viewer) {
    viewer.camera.changed.addEventListener(update360ButtonVisibility);
    update360ButtonVisibility();
  }
}

// ===== INITIALIZATION =====
async function init() {
  // Demo-ready replay defaults aligned with the bundled fixture data.
  dom.startAt.value = "2026-04-05T10:15:00Z";
  dom.endAt.value = "2026-04-05T10:16:00Z";
  dom.objectId.value = "veh_42";

  // Initialize core functionality first
  try {
    initCesium();
  } catch (e) {
    console.error("Cesium init failed:", e);
  }

  try {
    await initSession();
  } catch (e) {
    console.error("Session init failed:", e);
  }

  try {
    initEventListeners();
  } catch (e) {
    console.error("Event listeners init failed:", e);
  }

  syncLayerStateFromDom();
  updateActiveLayersCount();
  updateVisualEffects();
  updateSwanUI();

  // Start clock
  setInterval(updateTime, 1000);
  updateTime();

  // Start data refresh
  setInterval(refreshFreshnessDisplays, 15000);
  setInterval(loadSourceHealth, 30000);
  setInterval(loadAlerts, 15000);

  // Load external layers with smart polling
  loadExternalLayers();
  smartPollHandles.set(
    "externalLayers",
    startSmartPollLoop("externalLayers", loadExternalLayers, {
      intervalMs: 60000,
      pauseWhenHidden: true,
      maxBackoffMultiplier: 4,
    }),
  );

  // Load inferred intelligence with smart polling
  loadInferences();
  smartPollHandles.set(
    "inferences",
    startSmartPollLoop("inferences", loadInferences, {
      intervalMs: 60000,
      pauseWhenHidden: true,
      maxBackoffMultiplier: 4,
    }),
  );

  // Load correlations with smart polling
  loadCorrelations();
  smartPollHandles.set(
    "correlations",
    startSmartPollLoop("correlations", loadCorrelations, {
      intervalMs: 30000,
      pauseWhenHidden: true,
      maxBackoffMultiplier: 4,
    }),
  );

  initNewsAndWebcam();

  if (newsState.enabled) {
    loadNewsIntelligence();
    smartPollHandles.set(
      "news",
      startSmartPollLoop("news", loadNewsIntelligence, {
        intervalMs: 120000,
        pauseWhenHidden: true,
        maxBackoffMultiplier: 2,
      }),
    );
  }

  smartPollHandles.set(
    "webcams",
    startSmartPollLoop("webcams", loadWebcamChannels, {
      intervalMs: 60000,
      pauseWhenHidden: true,
      maxBackoffMultiplier: 2,
    }),
  );

  // Initial load
  loadSourceHealth();
  loadAlerts();

  // Start in replay mode
  switchToReplayMode();
  loadReplay();
  restoreStateFromUrl();

  // Location search & 360° view
  initViewportSearch();
  initPanorama();
}

// Start the app when DOM is ready
document.addEventListener("DOMContentLoaded", init);

// Breaking news banner is hooked inside loadAlerts()
