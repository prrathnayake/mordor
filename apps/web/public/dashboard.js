/**
 * MORDOR Operations Dashboard Module
 * Provides the 4-zone intelligence dashboard:
 * 1. Left Operations Sidebar (entity list, filters, search)
 * 2. Center Intelligence Canvas (Cesium map integration)
 * 3. Right Intelligence Panel (entity details, alerts, events, relationships)
 * 4. Bottom Telemetry Panel (metrics, event stream, charts, replay)
 *
 * Integrates with existing app.js state and APIs.
 */

// ===== DATA MODELS =====

/**
 * @typedef {Object} Entity
 * @property {string} id
 * @property {string} name
 * @property {string} type
 * @property {string} status
 * @property {string} severity
 * @property {{lat:number,lon:number,altitude_m?:number}|null} location
 * @property {Record<string,number>|null} metrics
 * @property {string|null} source
 * @property {string|null} updatedAt
 */

/**
 * @typedef {Object} Relationship
 * @property {string} id
 * @property {string} fromEntityId
 * @property {string} toEntityId
 * @property {string} type
 * @property {string} status
 * @property {number|null} strength
 */

/**
 * @typedef {Object} Event
 * @property {string} id
 * @property {string} entityId
 * @property {string} timestamp
 * @property {string} severity
 * @property {string} title
 * @property {string} description
 * @property {string} source
 */

/**
 * @typedef {Object} Alert
 * @property {string} id
 * @property {string} entityId
 * @property {string} severity
 * @property {string} status
 * @property {string} title
 * @property {string[]} evidence
 * @property {string} createdAt
 */

// ===== STATE =====
const dashboardState = {
  entities: /** @type {Entity[]} */ ([]),
  relationships: /** @type {Relationship[]} */ ([]),
  events: /** @type {Event[]} */ ([]),
  alerts: /** @type {Alert[]} */ ([]),
  selectedEntityId: /** @type {string|null} */ (null),
  searchQuery: "",
  filters: {
    types: /** @type {string[]} */ ([]),
    statuses: /** @type {string[]} */ ([]),
    severities: /** @type {string[]} */ ([]),
    sources: /** @type {string[]} */ ([]),
  },
  loading: false,
  error: /** @type {string|null} */ (null),
};

// ===== DOM REFERENCES =====
const dashDom = {
  // Left sidebar
  leftRailTabs: /** @type {HTMLElement|null} */ (null),
  operationsPanel: /** @type {HTMLElement|null} */ (null),
  entitySearch: /** @type {HTMLInputElement|null} */ (null),
  entityList: /** @type {HTMLElement|null} */ (null),
  filterTypes: /** @type {HTMLElement|null} */ (null),
  filterStatuses: /** @type {HTMLElement|null} */ (null),
  filterSeverities: /** @type {HTMLElement|null} */ (null),
  entityCount: /** @type {HTMLElement|null} */ (null),

  // Right panel
  rightRailTabs: /** @type {HTMLElement|null} */ (null),
  intelligencePanel: /** @type {HTMLElement|null} */ (null),
  intelligenceContent: /** @type {HTMLElement|null} */ (null),

  // Bottom telemetry
  telemetryPanel: /** @type {HTMLElement|null} */ (null),
  telemetryContent: /** @type {HTMLElement|null} */ (null),
  eventStream: /** @type {HTMLElement|null} */ (null),
  metricCards: /** @type {HTMLElement|null} */ (null),
};

// ===== UTILITY =====
function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatRelativeAge(timestamp) {
  if (!timestamp) return "--";
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "--";
  const ageSeconds = Math.max(0, Math.round((Date.now() - parsed.getTime()) / 1000));
  if (ageSeconds < 60) return `${ageSeconds}s ago`;
  if (ageSeconds < 3600) return `${Math.round(ageSeconds / 60)}m ago`;
  return `${Math.round(ageSeconds / 3600)}h ago`;
}

function getSeverityColor(severity) {
  switch (severity) {
    case "critical":
      return "#ef4444";
    case "warning":
      return "#f59e0b";
    case "info":
      return "#3b82f6";
    case "success":
      return "#22c55e";
    default:
      return "#6b7280";
  }
}

function getStatusColor(status) {
  switch (status) {
    case "active":
      return "#22c55e";
    case "degraded":
      return "#f59e0b";
    case "offline":
      return "#ef4444";
    case "warning":
      return "#f59e0b";
    case "open":
      return "#ef4444";
    case "acknowledged":
      return "#3b82f6";
    case "closed":
      return "#22c55e";
    default:
      return "#6b7280";
  }
}

// ===== DATA ADAPTER =====
function getApiBaseUrl() {
  const appConfig = window.__APP_CONFIG__ || {};
  return appConfig.apiBaseUrl || "http://127.0.0.1:3000";
}

function getAuthHeaders() {
  const token = localStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchEntities() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/state/latest`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.states && data.states.length > 0) {
      return data.states.map((s) => ({
        id: s.object_id,
        name: s.attributes?.callsign || s.attributes?.display_name || s.object_id,
        type: s.attributes?.type || "unknown",
        status: s.status || "unknown",
        severity: s.attributes?.severity || "info",
        location: s.position || null,
        metrics: {
          speed_mps: s.velocity?.speed_mps,
          heading_deg: s.velocity?.heading_deg,
          altitude_m: s.position?.altitude_m,
        },
        source: s.source_id || null,
        updatedAt: s.as_of || null,
      }));
    }
  } catch (error) {
    console.warn("Failed to fetch entities from API:", error);
  }
  return null;
}

async function fetchAlerts() {
  try {
    const response = await fetch(`${getApiBaseUrl()}/alerts?status=open&limit=50`, {
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.alerts && data.alerts.length > 0) {
      return data.alerts.map((a) => ({
        id: a.alert_id,
        entityId: a.evidence_object_ids?.[0] || "",
        severity: a.severity,
        status: a.status,
        title: a.summary,
        evidence: a.evidence_event_ids || [],
        createdAt: a.opened_at,
      }));
    }
  } catch (error) {
    console.warn("Failed to fetch alerts from API:", error);
  }
  return null;
}

async function loadDashboardData() {
  dashboardState.loading = true;
  dashboardState.error = null;
  renderLoadingStates();

  const [entities, alerts] = await Promise.all([fetchEntities(), fetchAlerts()]);

  dashboardState.entities = entities || [];
  dashboardState.alerts = alerts || [];
  dashboardState.relationships = [];
  dashboardState.events = [];

  dashboardState.loading = false;
  renderDashboard();
}

// ===== RENDERING =====
function renderLoadingStates() {
  if (dashDom.entityList) {
    dashDom.entityList.innerHTML = '<div class="loading-placeholder">Loading entities...</div>';
  }
  if (dashDom.intelligenceContent) {
    if (typeof window.renderIntelligenceSourcePanel === "function") {
      window.renderIntelligenceSourcePanel();
    } else {
      dashDom.intelligenceContent.innerHTML =
        '<div class="loading-placeholder">Loading intelligence...</div>';
    }
  }
  if (dashDom.telemetryContent) {
    dashDom.telemetryContent.innerHTML =
      '<div class="loading-placeholder">Loading telemetry...</div>';
  }
}

function getFilteredEntities() {
  let result = dashboardState.entities;

  if (dashboardState.searchQuery) {
    const q = dashboardState.searchQuery.toLowerCase();
    result = result.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.id.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q),
    );
  }

  if (dashboardState.filters.types.length > 0) {
    result = result.filter((e) => dashboardState.filters.types.includes(e.type));
  }
  if (dashboardState.filters.statuses.length > 0) {
    result = result.filter((e) => dashboardState.filters.statuses.includes(e.status));
  }
  if (dashboardState.filters.severities.length > 0) {
    result = result.filter((e) => dashboardState.filters.severities.includes(e.severity));
  }
  if (dashboardState.filters.sources.length > 0) {
    result = result.filter((e) => e.source && dashboardState.filters.sources.includes(e.source));
  }

  return result;
}

function renderEntityList() {
  if (!dashDom.entityList) return;

  const entities = getFilteredEntities();

  if (dashboardState.loading) {
    dashDom.entityList.innerHTML = '<div class="loading-placeholder">Loading entities...</div>';
    return;
  }

  if (entities.length === 0) {
    dashDom.entityList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">◉</span>
        <span class="empty-text">No entities match filters</span>
      </div>
    `;
    return;
  }

  dashDom.entityList.innerHTML = entities
    .map((entity) => {
      const isSelected = dashboardState.selectedEntityId === entity.id;
      const severityColor = getSeverityColor(entity.severity);
      const statusColor = getStatusColor(entity.status);
      const locText = entity.location
        ? `${entity.location.lat.toFixed(2)}, ${entity.location.lon.toFixed(2)}`
        : "No location";

      return `
        <div
          class="entity-card ${isSelected ? "selected" : ""}"
          data-entity-id="${escapeHtml(entity.id)}"
          role="button"
          tabindex="0"
        >
          <div class="entity-card-header">
            <div class="entity-card-name">${escapeHtml(entity.name)}</div>
            <div class="entity-card-badges">
              <span class="status-chip" style="color:${statusColor};border-color:${statusColor}">${entity.status}</span>
              <span class="severity-chip" style="color:${severityColor};border-color:${severityColor}">${entity.severity}</span>
            </div>
          </div>
          <div class="entity-card-meta">
            <span class="entity-card-type">${escapeHtml(entity.type)}</span>
            <span class="entity-card-id">${escapeHtml(entity.id)}</span>
          </div>
          <div class="entity-card-location">${locText}</div>
          <div class="entity-card-age">${formatRelativeAge(entity.updatedAt)}</div>
        </div>
      `;
    })
    .join("");

  dashDom.entityList.querySelectorAll(".entity-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectEntity(card.dataset.entityId);
    });
  });

  if (dashDom.entityCount) {
    dashDom.entityCount.textContent = `${entities.length}`;
  }
}

function renderFilters() {
  if (!dashDom.filterTypes) return;
  const allTypes = [...new Set(dashboardState.entities.map((e) => e.type))];
  const allStatuses = [...new Set(dashboardState.entities.map((e) => e.status))];
  const allSeverities = [...new Set(dashboardState.entities.map((e) => e.severity))];

  const buildFilterGroup = (items, selected, name) =>
    items
      .map(
        (item) => `
      <label class="filter-chip ${selected.includes(item) ? "active" : ""}">
        <input type="checkbox" value="${escapeHtml(item)}" name="${name}" ${selected.includes(item) ? "checked" : ""} />
        <span>${escapeHtml(item)}</span>
      </label>
    `,
      )
      .join("");

  dashDom.filterTypes.innerHTML = buildFilterGroup(allTypes, dashboardState.filters.types, "type");
  dashDom.filterStatuses.innerHTML = buildFilterGroup(
    allStatuses,
    dashboardState.filters.statuses,
    "status",
  );
  dashDom.filterSeverities.innerHTML = buildFilterGroup(
    allSeverities,
    dashboardState.filters.severities,
    "severity",
  );

  [dashDom.filterTypes, dashDom.filterStatuses, dashDom.filterSeverities].forEach((container) => {
    if (!container) return;
    container.querySelectorAll("input[type=checkbox]").forEach((input) => {
      input.addEventListener("change", () => {
        const name = input.name;
        const value = input.value;
        const list =
          dashboardState.filters[/** @type {"types"|"statuses"|"severities"} */ (`${name}s`)];
        if (input.checked) {
          if (!list.includes(value)) list.push(value);
        } else {
          const idx = list.indexOf(value);
          if (idx >= 0) list.splice(idx, 1);
        }
        renderEntityList();
      });
    });
  });
}

function renderIntelligencePanel() {
  if (!dashDom.intelligenceContent) return;

  const entity = dashboardState.entities.find((e) => e.id === dashboardState.selectedEntityId);

  if (!entity) {
    if (typeof window.renderIntelligenceSourcePanel === "function") {
      window.renderIntelligenceSourcePanel();
      return;
    }
    dashDom.intelligenceContent.innerHTML = `
      <div class="intelligence-empty">
        <span class="empty-icon">◉</span>
        <span class="empty-text">Select an entity to view intelligence</span>
      </div>
    `;
    return;
  }

  const relatedAlerts = dashboardState.alerts.filter((a) => a.entityId === entity.id);
  const relatedEvents = dashboardState.events.filter((e) => e.entityId === entity.id);
  const relatedRelationships = dashboardState.relationships.filter(
    (r) => r.fromEntityId === entity.id || r.toEntityId === entity.id,
  );

  const locText = entity.location
    ? `${entity.location.lat.toFixed(6)}, ${entity.location.lon.toFixed(6)}${entity.location.altitude_m !== undefined ? ` @ ${Math.round(entity.location.altitude_m)}m` : ""}`
    : "No location data";

  const metricsHtml = entity.metrics
    ? Object.entries(entity.metrics)
        .filter(([, v]) => typeof v === "number")
        .map(
          ([k, v]) => `
        <div class="metric-item">
          <span class="metric-label">${escapeHtml(k)}</span>
          <span class="metric-value">${typeof v === "number" ? v.toFixed(1) : v}</span>
        </div>
      `,
        )
        .join("")
    : "";

  const alertsHtml = relatedAlerts.length
    ? relatedAlerts
        .map(
          (alert) => `
        <div class="alert-list-item ${alert.severity}">
          <div class="alert-list-title">${escapeHtml(alert.title)}</div>
          <div class="alert-list-meta">
            <span class="alert-list-status ${alert.status}">${alert.status}</span>
            <span>${formatRelativeAge(alert.createdAt)}</span>
          </div>
        </div>
      `,
        )
        .join("")
    : '<div class="no-data">No related alerts</div>';

  const eventsHtml = relatedEvents.length
    ? relatedEvents
        .map(
          (evt) => `
        <div class="event-list-item ${evt.severity}">
          <div class="event-list-title">${escapeHtml(evt.title)}</div>
          <div class="event-list-desc">${escapeHtml(evt.description)}</div>
          <div class="event-list-meta">${formatRelativeAge(evt.timestamp)} • ${escapeHtml(evt.source)}</div>
        </div>
      `,
        )
        .join("")
    : '<div class="no-data">No recent events</div>';

  const relationshipsHtml = relatedRelationships.length
    ? relatedRelationships
        .map((rel) => {
          const otherId = rel.fromEntityId === entity.id ? rel.toEntityId : rel.fromEntityId;
          const other = dashboardState.entities.find((e) => e.id === otherId);
          const direction = rel.fromEntityId === entity.id ? "→" : "←";
          return `
          <div class="relationship-item">
            <span class="relationship-direction">${direction}</span>
            <span class="relationship-target">${escapeHtml(other?.name || otherId)}</span>
            <span class="relationship-type">${escapeHtml(rel.type)}</span>
            <span class="relationship-strength">${rel.strength ? `${(rel.strength * 100).toFixed(0)}%` : ""}</span>
          </div>
        `;
        })
        .join("")
    : '<div class="no-data">No known relationships</div>';

  const confidenceScore = entity.metrics
    ? Math.min(
        100,
        Math.round(
          (Object.values(entity.metrics).filter((v) => typeof v === "number" && v > 0).length /
            Object.values(entity.metrics).length) *
            100,
        ),
      )
    : 0;

  dashDom.intelligenceContent.innerHTML = `
    <div class="intelligence-header">
      <div class="intelligence-title">${escapeHtml(entity.name)}</div>
      <div class="intelligence-subtitle">${escapeHtml(entity.id)} • ${escapeHtml(entity.type)}</div>
    </div>

    <div class="intelligence-section">
      <div class="section-title">STATUS</div>
      <div class="status-row">
        <span class="status-badge" style="color:${getStatusColor(entity.status)};border-color:${getStatusColor(entity.status)}">${entity.status}</span>
        <span class="severity-badge" style="color:${getSeverityColor(entity.severity)};border-color:${getSeverityColor(entity.severity)}">${entity.severity}</span>
      </div>
      <div class="intelligence-field">
        <span class="field-label">Location</span>
        <span class="field-value">${locText}</span>
      </div>
      <div class="intelligence-field">
        <span class="field-label">Source</span>
        <span class="field-value">${escapeHtml(entity.source || "--")}</span>
      </div>
      <div class="intelligence-field">
        <span class="field-label">Updated</span>
        <span class="field-value">${formatRelativeAge(entity.updatedAt)}</span>
      </div>
    </div>

    ${
      metricsHtml
        ? `
    <div class="intelligence-section">
      <div class="section-title">METRICS</div>
      <div class="metrics-grid">${metricsHtml}</div>
    </div>
    `
        : ""
    }

    <div class="intelligence-section">
      <div class="section-title">RELATIONSHIPS (${relatedRelationships.length})</div>
      <div class="relationships-list">${relationshipsHtml}</div>
    </div>

    <div class="intelligence-section">
      <div class="section-title">ALERTS (${relatedAlerts.length})</div>
      <div class="alerts-list">${alertsHtml}</div>
    </div>

    <div class="intelligence-section">
      <div class="section-title">RECENT EVENTS (${relatedEvents.length})</div>
      <div class="events-list">${eventsHtml}</div>
    </div>

    <div class="intelligence-section">
      <div class="section-title">AI INSIGHTS</div>
      <div class="insight-box">
        <div class="insight-confidence">
          <span class="confidence-label">Confidence</span>
          <span class="confidence-value">${confidenceScore}%</span>
        </div>
        <div class="insight-text">
          ${
            confidenceScore > 80
              ? "Entity telemetry is healthy and consistent with expected behavior."
              : confidenceScore > 50
                ? "Partial telemetry available. Monitor for anomalies."
                : "Limited telemetry. Recommend manual verification."
          }
        </div>
      </div>
    </div>
  `;
}

function renderTelemetryPanel() {
  if (!dashDom.telemetryContent) return;

  const totalEntities = dashboardState.entities.length;
  const activeEntities = dashboardState.entities.filter((e) => e.status === "active").length;
  const criticalAlerts = dashboardState.alerts.filter(
    (a) => a.severity === "critical" && a.status === "open",
  ).length;
  const warningAlerts = dashboardState.alerts.filter(
    (a) => a.severity === "warning" && a.status === "open",
  ).length;

  const recentEvents = [...dashboardState.events]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 6);

  const eventStreamHtml = recentEvents.length
    ? recentEvents
        .map(
          (evt) => `
        <div class="stream-item ${evt.severity}">
          <span class="stream-time">${formatRelativeAge(evt.timestamp)}</span>
          <span class="stream-entity">${escapeHtml(evt.entityId)}</span>
          <span class="stream-title">${escapeHtml(evt.title)}</span>
        </div>
      `,
        )
        .join("")
    : '<div class="no-data">No events</div>';

  // Simple bar chart for entity statuses
  const statusCounts = {};
  for (const e of dashboardState.entities) {
    statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
  }
  const maxCount = Math.max(1, ...Object.values(statusCounts));
  const chartHtml = Object.entries(statusCounts)
    .map(
      ([status, count]) => `
      <div class="chart-bar-row">
        <span class="chart-bar-label">${escapeHtml(status)}</span>
        <div class="chart-bar-track">
          <div class="chart-bar-fill" style="width:${(count / maxCount) * 100}%;background:${getStatusColor(status)}"></div>
        </div>
        <span class="chart-bar-value">${count}</span>
      </div>
    `,
    )
    .join("");

  dashDom.telemetryContent.innerHTML = `
    <div class="telemetry-grid">
      <div class="metric-card">
        <div class="metric-card-label">ENTITIES</div>
        <div class="metric-card-value">${activeEntities}<span class="metric-card-total">/${totalEntities}</span></div>
        <div class="metric-card-sub">Active</div>
      </div>
      <div class="metric-card critical">
        <div class="metric-card-label">CRITICAL</div>
        <div class="metric-card-value">${criticalAlerts}</div>
        <div class="metric-card-sub">Open alerts</div>
      </div>
      <div class="metric-card warning">
        <div class="metric-card-label">WARNINGS</div>
        <div class="metric-card-value">${warningAlerts}</div>
        <div class="metric-card-sub">Open alerts</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-label">UPTIME</div>
        <div class="metric-card-value">99.2%</div>
        <div class="metric-card-sub">Last 24h</div>
      </div>
    </div>

    <div class="telemetry-section">
      <div class="section-title">ENTITY STATUS</div>
      <div class="simple-chart">${chartHtml}</div>
    </div>

    <div class="telemetry-section">
      <div class="section-title">EVENT STREAM</div>
      <div class="event-stream">${eventStreamHtml}</div>
    </div>
  `;
}

function renderDashboard() {
  renderEntityList();
  renderFilters();
  renderIntelligencePanel();
  renderTelemetryPanel();
}

function selectEntity(entityId) {
  dashboardState.selectedEntityId = entityId;
  renderEntityList();
  renderIntelligencePanel();

  // Also trigger existing app.js object selection if available
  if (typeof window.selectObject === "function") {
    window.selectObject(entityId);
  }

  // Focus map if location available
  const entity = dashboardState.entities.find((e) => e.id === entityId);
  if (entity?.location && typeof viewer !== "undefined" && viewer) {
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        entity.location.lon,
        entity.location.lat,
        Math.max(entity.location.altitude_m || 0, 2500),
      ),
      duration: 1,
    });
  }
}

// ===== TABS =====
function initTabs() {
  // Left rail tabs
  const leftTabs = dashDom.leftRailTabs;
  if (leftTabs) {
    leftTabs.querySelectorAll(".rail-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.tab;
        leftTabs.querySelectorAll(".rail-tab").forEach((t) => {
          t.classList.remove("active");
        });
        tab.classList.add("active");
        document.querySelectorAll(".left-rail .tab-panel").forEach((p) => {
          p.classList.add("hidden");
        });
        const panel = document.querySelector(`.left-rail .tab-panel[data-tab="${target}"]`);
        if (panel) panel.classList.remove("hidden");
      });
    });
  }

  // Right rail tabs
  const rightTabs = dashDom.rightRailTabs;
  if (rightTabs) {
    rightTabs.querySelectorAll(".rail-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.tab;
        rightTabs.querySelectorAll(".rail-tab").forEach((t) => {
          t.classList.remove("active");
        });
        tab.classList.add("active");
        document.querySelectorAll(".right-rail .tab-panel").forEach((p) => {
          p.classList.add("hidden");
        });
        const panel = document.querySelector(`.right-rail .tab-panel[data-tab="${target}"]`);
        if (panel) panel.classList.remove("hidden");
        if (
          target === "intelligence" &&
          typeof window.renderIntelligenceSourcePanel === "function"
        ) {
          window.renderIntelligenceSourcePanel();
        }
      });
    });
  }
}

// ===== SEARCH =====
function initSearch() {
  if (!dashDom.entitySearch) return;
  let searchDebounceTimer = null;
  dashDom.entitySearch.addEventListener("input", (e) => {
    dashboardState.searchQuery = (e.target.value || "").trim();
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    searchDebounceTimer = setTimeout(() => {
      renderEntityList();
      searchDebounceTimer = null;
    }, 150);
  });
}

// ===== MAP TOOLTIP ENHANCEMENTS =====
function initMapTooltipEnhancements() {
  if (typeof viewer === "undefined" || !viewer) return;

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((movement) => {
    const pickedObject = viewer.scene.pick(movement.endPosition);
    if (Cesium.defined(pickedObject) && pickedObject.id?.properties) {
      const objectId = pickedObject.id.properties.objectId?.getValue?.();
      if (objectId) {
        const entity = dashboardState.entities.find((e) => e.id === objectId);
        if (entity) {
          showMapTooltip(movement.endPosition, entity);
          return;
        }
      }
    }
    hideMapTooltip();
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

function showMapTooltip(screenPosition, entity) {
  let tooltip = document.getElementById("map-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "map-tooltip";
    tooltip.className = "map-tooltip";
    document.body.appendChild(tooltip);
  }

  tooltip.innerHTML = `
    <div class="tooltip-title">${escapeHtml(entity.name)}</div>
    <div class="tooltip-meta">${escapeHtml(entity.type)} • ${escapeHtml(entity.status)}</div>
    ${entity.location?.altitude_m ? `<div class="tooltip-meta">ALT ${Math.round(entity.location.altitude_m)}m</div>` : ""}
  `;

  tooltip.style.left = `${screenPosition.x + 12}px`;
  tooltip.style.top = `${screenPosition.y + 12}px`;
  tooltip.style.display = "block";

  if (typeof emitSwanActivity === "function") {
    emitSwanActivity("widget_interacted", {
      targetType: "widget",
      targetId: entity.id,
      context: {
        widgetType: "tooltip",
        action: "hover",
        layerId: entity.layerId || "unknown",
        entityId: entity.id,
      },
    });
  }
}

function hideMapTooltip() {
  const tooltip = document.getElementById("map-tooltip");
  if (tooltip) tooltip.style.display = "none";
}

// ===== POLLING ABSTRACTION =====
function startPolling() {
  // Poll every 30s for entities and alerts
  setInterval(() => {
    loadDashboardData();
  }, 30000);
}

// ===== INITIALIZATION =====
function initDashboard() {
  // Cache DOM references
  dashDom.leftRailTabs = document.getElementById("left-rail-tabs");
  dashDom.operationsPanel = document.getElementById("operations-panel");
  dashDom.entitySearch = /** @type {HTMLInputElement|null} */ (
    document.getElementById("entity-search")
  );
  dashDom.entityList = document.getElementById("entity-list");
  dashDom.filterTypes = document.getElementById("filter-types");
  dashDom.filterStatuses = document.getElementById("filter-statuses");
  dashDom.filterSeverities = document.getElementById("filter-severities");
  dashDom.entityCount = document.getElementById("entity-count");

  dashDom.rightRailTabs = document.getElementById("right-rail-tabs");
  dashDom.intelligencePanel = document.getElementById("intelligence-panel");
  dashDom.intelligenceContent = document.getElementById("intelligence-content");

  dashDom.telemetryPanel = document.getElementById("telemetry-panel");
  dashDom.telemetryContent = document.getElementById("telemetry-content");

  initTabs();
  initSearch();

  // Delay map enhancements until Cesium is ready
  const tryInitMap = () => {
    if (typeof viewer !== "undefined" && viewer) {
      initMapTooltipEnhancements();
    } else {
      setTimeout(tryInitMap, 500);
    }
  };
  tryInitMap();

  loadDashboardData();
  startPolling();
}

// Expose selectEntity globally for integration with existing app.js
window.selectDashboardEntity = selectEntity;

// Initialize after DOM is ready
document.addEventListener("DOMContentLoaded", initDashboard);
