function _escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function _escapeAttr(str) {
  if (typeof str !== "string") return "";
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

class UIAgentRuntime {
  constructor(config) {
    this.agents = new Map();
    this.history = [];
    this.maxHistory = config.maxHistory || 50;
    this.cesiumViewer = config.cesiumViewer || window.__CESIUM_VIEWER__ || null;
    this.apiBaseUrl = config.apiBaseUrl || window.__APP_CONFIG__?.apiBaseUrl || "";
    this.active = false;
    this.entityCache = new Map();
    this._entityIdCounter = 0;
  }

  start() {
    this.active = true;
    console.log("[UIAgentRuntime] Started");
  }

  stop() {
    this.active = false;
    this.clearTemporaryEntities();
    console.log("[UIAgentRuntime] Stopped");
  }

  registerAgent(id, agent) {
    this.agents.set(id, agent);
    if (agent.onRegister) agent.onRegister(this);
  }

  unregisterAgent(id) {
    this.agents.delete(id);
  }

  observe(event) {
    if (!event?.type) return;
    this.history.push({
      ...event,
      timestamp: event.timestamp || Date.now(),
    });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    this.evaluate(event);
  }

  evaluate(event) {
    if (!this.active) return;
    for (const [id, agent] of this.agents) {
      try {
        if (agent.shouldTrigger(event, this.history)) {
          agent.execute(event, this);
        }
      } catch (err) {
        console.error(`[UIAgentRuntime] Agent "${id}" error:`, err);
      }
    }
  }

  async fetchGraph(path) {
    try {
      const url = this.apiBaseUrl ? this.apiBaseUrl + path : path;
      const response = await fetch(url);
      if (!response.ok) return null;
      return await response.json();
    } catch (err) {
      console.warn("[UIAgentRuntime] Graph fetch failed:", path, err);
      return null;
    }
  }

  getRecentEvents(type, count) {
    if (!type) return this.history.slice(-count);
    return this.history.filter((e) => e.type === type).slice(-count);
  }

  getEntityById(id) {
    let entity = this.entityCache.get(id);
    if (entity) return entity;
    if (this.cesiumViewer) {
      entity = this.cesiumViewer.entities.getById(id);
      if (entity) this.entityCache.set(id, entity);
    }
    return entity || null;
  }

  nextEntityId(prefix) {
    this._entityIdCounter++;
    return `${prefix || "ui-agent"}-${this._entityIdCounter}-${Date.now()}`;
  }

  createMapPin(lon, lat, options) {
    if (!this.cesiumViewer || typeof Cesium === "undefined") return null;
    const opts = options || {};
    const color = opts.color || "#00ff41";
    const label = opts.label || "";
    const id = this.nextEntityId("pin");
    const entity = this.cesiumViewer.entities.add({
      id: id,
      position: Cesium.Cartesian3.fromDegrees(lon, lat, opts.altitude || 0),
      point: {
        pixelSize: opts.pixelSize || 10,
        color: Cesium.Color.fromCssColorString(color),
        outlineColor: Cesium.Color.fromCssColorString(opts.outlineColor || "#000000"),
        outlineWidth: opts.outlineWidth || 2,
        heightReference: Cesium.HeightReference.NONE,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
          0,
          opts.maxDistance || 5000000,
        ),
      },
      label: label
        ? {
            text: label,
            font: opts.font || "11px monospace",
            fillColor: Cesium.Color.fromCssColorString(color),
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(0, -14),
            heightReference: Cesium.HeightReference.NONE,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
              0,
              opts.maxLabelDistance || 2000000,
            ),
          }
        : undefined,
      properties: opts.properties || undefined,
    });
    this.entityCache.set(id, entity);
    return entity;
  }

  drawRouteLine(fromLon, fromLat, toLon, toLat, options) {
    if (!this.cesiumViewer || typeof Cesium === "undefined") return null;
    const opts = options || {};
    const color = Cesium.Color.fromCssColorString(opts.color || "#ff6600");
    const id = this.nextEntityId("route");

    const positions = Cesium.Cartesian3.fromDegreesArray([fromLon, fromLat, toLon, toLat]);

    const entity = this.cesiumViewer.entities.add({
      id: id,
      polyline: {
        positions: positions,
        width: opts.width || 2,
        material: opts.dashed
          ? new Cesium.PolylineDashMaterialProperty({ color: color, dashLength: 16 })
          : color,
        arcType: Cesium.ArcType.GEODESIC,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(
          0,
          opts.maxDistance || 5000000,
        ),
      },
      properties: opts.properties || undefined,
    });
    this.entityCache.set(id, entity);
    return entity;
  }

  flyTo(lon, lat, altitude, duration) {
    if (!this.cesiumViewer || typeof Cesium === "undefined") return;
    this.cesiumViewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, altitude || 10000),
      duration: duration || 1.5,
    });
  }

  clearTemporaryEntities() {
    if (!this.cesiumViewer) return;
    for (const id of this.entityCache.keys()) {
      const entity = this.cesiumViewer.entities.getById(id);
      if (entity) {
        this.cesiumViewer.entities.remove(entity);
      }
    }
    this.entityCache.clear();
  }

  removeEntity(id) {
    const entity = this.entityCache.get(id);
    if (entity && this.cesiumViewer) {
      this.cesiumViewer.entities.remove(entity);
      this.entityCache.delete(id);
    }
  }

  showTooltip(element, screenX, screenY) {
    element.style.position = "fixed";
    element.style.left = `${screenX}px`;
    element.style.top = `${screenY}px`;
    element.style.zIndex = "9999";
    element.style.pointerEvents = "none";
    document.body.appendChild(element);
  }

  hideTooltip(element) {
    if (element?.parentNode) {
      element.parentNode.removeChild(element);
    }
  }
}

class EventTracer {
  constructor(runtime) {
    this.runtime = runtime;
  }

  trackNewsClick(linkEl, articleData) {
    this.runtime.observe({
      type: "news_click",
      target: linkEl,
      data: articleData,
      position: null,
    });
  }

  trackEntitySelect(entityId, position) {
    this.runtime.observe({
      type: "entity_select",
      target: null,
      data: { entityId: entityId },
      position: position || null,
    });
  }

  trackSearch(query) {
    this.runtime.observe({
      type: "search",
      target: null,
      data: { query: query },
      position: null,
    });
  }

  trackAlertInspect(alertId, position) {
    this.runtime.observe({
      type: "alert_inspect",
      target: null,
      data: { alertId: alertId },
      position: position || null,
    });
  }

  trackIncidentOpen(incidentId) {
    this.runtime.observe({
      type: "incident_open",
      target: null,
      data: { incidentId: incidentId },
      position: null,
    });
  }
}

window.UIAgentRuntime = UIAgentRuntime;
window.EventTracer = EventTracer;
