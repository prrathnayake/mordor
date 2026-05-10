(() => {
  // ===== State =====
  const state = {
    layers: {}, // layerId -> boolean (enabled)
    entities: new Map(), // layerId -> Map<id, Entity>
    data: new Map(), // layerId -> array of items
    cache: new Map(), // layerId -> { data, fetchedAt, ttl }
    viewers: new Map(), // layerId -> EntityView bound
    intervals: new Map(), // layerId -> intervalId
    pollCounters: new Map(), // layerId -> counter for smart polling
  };

  const CACHE_TTL_MS = 60000;
  const POLL_INTERVAL_MS = 30000;
  let viewer = null;

  // ===== Layer Config =====
  const LAYER_CONFIGS = [
    {
      id: "aviation",
      name: "Live Aviation",
      source: "OpenSky + ADSB.lol",
      endpoint: "/universal/aviation",
      geospatial: true,
      cluster: true,
      defaultOn: true,
      icon: "✈",
      interval: 30000,
    },
    {
      id: "news",
      name: "News Intelligence",
      source: "NewsAPI + MediaStack",
      endpoint: "/universal/news?limit=25",
      geospatial: false,
      defaultOn: false,
      icon: "📰",
      interval: 60000,
    },
    {
      id: "weather",
      name: "Weather Stations",
      source: "OpenWeatherMap + NOAA",
      endpoint: "/universal/weather",
      geospatial: true,
      defaultOn: false,
      icon: "🌤",
      interval: 60000,
    },
    {
      id: "space",
      name: "Space & NASA",
      source: "NASA + EONET",
      endpoint: "/universal/space?limit=20",
      geospatial: true,
      defaultOn: false,
      icon: "🛰",
      interval: 120000,
    },
    {
      id: "finance",
      name: "Financial Markets",
      source: "Alpha Vantage + CoinGecko",
      endpoint: "/universal/finance",
      geospatial: false,
      defaultOn: false,
      icon: "💰",
      interval: 60000,
    },
    {
      id: "social",
      name: "Social Intelligence",
      source: "Reddit + Bluesky",
      endpoint: "/universal/social?limit=25",
      geospatial: false,
      defaultOn: false,
      icon: "💬",
      interval: 60000,
    },
    {
      id: "security",
      name: "Threat Intel",
      source: "AbuseIPDB + OTX + Shodan",
      endpoint: "/universal/security?limit=25",
      geospatial: true,
      cluster: true,
      defaultOn: false,
      icon: "🔒",
      interval: 120000,
    },
    {
      id: "seismic",
      name: "Seismic Events",
      source: "USGS + EMSC",
      endpoint: "/universal/seismic?limit=50",
      geospatial: true,
      cluster: true,
      defaultOn: false,
      icon: "📡",
      interval: 30000,
    },
    {
      id: "maritime",
      name: "Maritime Traffic",
      source: "MarineTraffic + VesselFinder",
      endpoint: "/universal/vessels?limit=50",
      geospatial: true,
      cluster: true,
      defaultOn: false,
      icon: "🚢",
      interval: 60000,
    },
    {
      id: "custom_intel",
      name: "Custom Intel",
      source: "Internal Sources",
      endpoint: "/universal/custom-intel?limit=25",
      geospatial: true,
      cluster: false,
      defaultOn: false,
      icon: "🎯",
      interval: 120000,
    },
  ];

  const LAYER_META = {};

  LAYER_CONFIGS.forEach((cfg) => {
    LAYER_META[cfg.id] = cfg;
  });

  // ===== Category Colors =====
  const COLORS = {
    aviation: { fill: "#38bdf8", outline: "#0ea5e9" },
    news: { fill: "#f59e0b", outline: "#d97706" },
    weather: { fill: "#22d3ee", outline: "#06b6d4" },
    space: { fill: "#a78bfa", outline: "#7c3aed" },
    finance: { fill: "#4ade80", outline: "#16a34a" },
    social: { fill: "#60a5fa", outline: "#2563eb" },
    security: { fill: "#f87171", outline: "#dc2626" },
    seismic: { fill: "#fb923c", outline: "#ea580c" },
    maritime: { fill: "#0ea5e9", outline: "#0284c7" },
    custom_intel: { fill: "#e879f9", outline: "#c026d3" },
  };

  // ===== Canvas Icon Factory =====
  const iconCache = {};

  function _getCategoryIcon(layerId, size) {
    const key = `${layerId}_${size}`;
    if (iconCache[key]) return iconCache[key];

    const c = COLORS[layerId] || { fill: "#6b7280", outline: "#4b5563" };
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const cx = size / 2,
      cy = size / 2,
      r = size / 2 - 2;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = c.fill;
    ctx.globalAlpha = 0.7;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = c.outline;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = c.outline;
    ctx.fill();

    iconCache[key] = canvas;
    return canvas;
  }

  // ===== Utility =====
  function escapeHtml(str) {
    if (str == null) return "";
    const d = document.createElement("div");
    d.textContent = String(str);
    return d.innerHTML;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return "";
    const ms = Date.now() - new Date(dateStr).getTime();
    if (ms < 60000) return "now";
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
    if (ms < 86400000) return `${Math.floor(ms / 3600000)}h`;
    return `${Math.floor(ms / 86400000)}d`;
  }

  function fetchJson(url) {
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });
  }

  function updateLayerMeta(layerId, count, status) {
    const countEl = document.getElementById(`layer-count-${layerId}`);
    const statusEl = document.getElementById(`layer-status-${layerId}`);
    const updateEl = document.getElementById(`layer-update-${layerId}`);
    if (countEl) countEl.textContent = count;
    if (statusEl) statusEl.textContent = status;
    if (updateEl) updateEl.textContent = new Date().toLocaleTimeString();
  }

  // ===== Cache =====
  function getCached(layerId) {
    const entry = state.cache.get(layerId);
    if (!entry) return null;
    if (Date.now() - entry.fetchedAt > entry.ttl) {
      state.cache.delete(layerId);
      return null;
    }
    return entry.data;
  }

  function setCache(layerId, data, ttl) {
    state.cache.set(layerId, { data, fetchedAt: Date.now(), ttl: ttl || CACHE_TTL_MS });
  }

  // ===== Cesium Entity Management =====
  function cartesian(lat, lon, alt) {
    return Cesium.Cartesian3.fromDegrees(lon, lat, alt || 0);
  }

  function createLayerEntityMap(layerId) {
    if (!state.entities.has(layerId)) {
      state.entities.set(layerId, new Map());
    }
    return state.entities.get(layerId);
  }

  function _upsertEntity(layerId, id, spec) {
    if (!viewer) return null;
    const map = createLayerEntityMap(layerId);
    let entity = map.get(id);
    if (entity) {
      entity.position = spec.position;
      if (spec.point) Object.assign(entity.point || {}, spec.point);
      if (spec.label) Object.assign(entity.label || {}, spec.label);
      if (spec.billboard) Object.assign(entity.billboard || {}, spec.billboard);
      if (spec.ellipse) Object.assign(entity.ellipse || {}, spec.ellipse);
      if (spec.polyline) Object.assign(entity.polyline || {}, spec.polyline);
    } else {
      entity = viewer.entities.add(spec);
      map.set(id, entity);
    }
    return entity;
  }

  function clearLayerEntities(layerId) {
    if (!viewer) return;
    const map = state.entities.get(layerId);
    if (map) {
      map.forEach((e) => {
        viewer.entities.remove(e);
      });
      map.clear();
    }
  }

  function _clearAllEntities() {
    if (!viewer) return;
    state.entities.forEach((map) => {
      map.forEach((e) => {
        viewer.entities.remove(e);
      });
      map.clear();
    });
  }

  // ===== Data Fetchers =====
  async function fetchLayer(layerId) {
    const cfg = LAYER_META[layerId];
    if (!cfg) return;

    const cached = getCached(layerId);
    if (cached) {
      renderLayerData(layerId, cached);
      updateLayerMeta(layerId, cached.length, "CACHED");
      return;
    }

    try {
      const data = await fetchJson(cfg.endpoint);
      setCache(layerId, data);
      state.data.set(layerId, data);
      renderLayerData(layerId, data);
      const count = Array.isArray(data) ? data.length : 0;
      updateLayerMeta(layerId, count, "OK");
    } catch (_e) {
      updateLayerMeta(layerId, 0, "ERR");
    }
  }

  function renderLayerData(layerId, data) {
    if (!state.layers[layerId]) return;

    const cfg = LAYER_META[layerId];
    if (cfg.geospatial) {
      renderGeospatialLayer(layerId, data);
    }
    renderPanelLayer(layerId, data);
  }

  // ===== Geospatial Renderers =====
  function renderGeospatialLayer(layerId, data) {
    clearLayerEntities(layerId);
    if (!viewer || !state.layers[layerId]) return;
    if (!Array.isArray(data)) return;

    const c = COLORS[layerId] || { fill: "#6b7280", outline: "#4b5563" };
    const color = Cesium.Color.fromCssColorString(c.fill);
    const outlineColor = Cesium.Color.fromCssColorString(c.outline);
    const map = createLayerEntityMap(layerId);

    data.forEach((item) => {
      const lat = item.lat != null ? item.lat : item.latitude;
      const lon = item.lon != null ? item.lon : item.longitude;
      if (lat == null || lon == null) return;

      const alt = item.altitude_m || item.altitudeM || 0;
      const id = `${layerId}_${item.id || item.external_id || Math.random().toString(36).slice(2, 8)}`;
      const labelText = getLabel(layerId, item);
      const isCritical = item.severity === "critical" || item.severity === "high";

      const spec = {
        position: cartesian(lat, lon, alt),
        point: {
          pixelSize: isCritical ? 12 : layerId === "aviation" ? 10 : 8,
          color: color.withAlpha(0.85),
          outlineColor: isCritical ? Cesium.Color.RED : outlineColor,
          outlineWidth: isCritical ? 3 : 1.5,
          heightReference: Cesium.HeightReference.NONE,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000000),
        },
        label: {
          text: labelText,
          font: "11px monospace",
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -14),
          heightReference: Cesium.HeightReference.NONE,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2000000),
          show: true,
        },
        description: buildDescription(layerId, item),
      };

      const entity = viewer.entities.add(spec);
      map.set(id, entity);
    });

    // Add density-based cluster if configured
    if (cfg.cluster && map.size > 50 && viewer.scene) {
      viewer.scene.clustering.enabled = true;
      viewer.scene.clustering.clusterEvent.addEventListener((clusteredEntities, cluster) => {
        cluster.label.text = clusteredEntities.length.toString();
        cluster.label.font = "12px monospace";
        cluster.label.fillColor = color;
        cluster.label.outlineColor = Cesium.Color.BLACK;
        cluster.label.outlineWidth = 2;
        cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
        cluster.point.color = color.withAlpha(0.3);
        cluster.point.pixelSize = Math.min(20 + clusteredEntities.length * 2, 60);
        cluster.point.outlineColor = outlineColor;
        cluster.point.outlineWidth = 2;
      });
    }
  }

  function getLabel(layerId, item) {
    switch (layerId) {
      case "aviation":
        return item.callsign || item.icao24 || "";
      case "weather":
        return item.temperature_c != null ? `${item.temperature_c}°C` : "";
      case "security":
        return item.ip_address || item.domain || "";
      case "space":
        return item.title ? item.title.slice(0, 25) : "";
      case "seismic":
        return item.magnitude != null ? `M${item.magnitude}` : "";
      case "maritime":
        return item.vessel_name || item.imo || "";
      case "custom_intel":
        return item.title ? item.title.slice(0, 30) : "";
      default:
        return "";
    }
  }

  function buildDescription(_layerId, item) {
    const rows = [];
    for (const [k, v] of Object.entries(item)) {
      if (v == null || k === "metadata" || k === "payload") continue;
      rows.push(
        `<tr><td style="color:#6b7280;padding-right:8px">${k}</td><td>${escapeHtml(String(v).slice(0, 100))}</td></tr>`,
      );
    }
    return `<table style="font:11px monospace">${rows.join("")}</table>`;
  }

  // ===== Panel Renderers =====
  function renderPanelLayer(layerId, data) {
    const renderers = {
      news: renderNewsPanel,
      finance: renderFinancePanel,
      social: renderSocialPanel,
      space: renderSpacePanel,
      security: renderSecurityPanel,
    };
    const fn = renderers[layerId];
    if (fn) fn(data);
  }

  function getPanelContainer(layerId) {
    return document.getElementById(`ud-panel-${layerId}`);
  }

  function renderNewsPanel(articles) {
    const panel = getPanelContainer("news");
    if (!panel) return;
    if (!state.layers.news) {
      panel.innerHTML = "";
      return;
    }
    panel.innerHTML = (articles || [])
      .slice(0, 20)
      .map(
        (a) => `
      <div class="intel-item">
        <div class="intel-item-header">
          <span class="intel-item-source">${escapeHtml(a.source_name || a.source)}</span>
          <span class="intel-item-time">${timeAgo(a.published_at)}</span>
        </div>
        <div class="intel-item-title"><a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.title)}</a></div>
        ${a.description ? `<div class="intel-item-desc">${escapeHtml(a.description.slice(0, 200))}</div>` : ""}
        ${a.url_to_image ? `<img src="${escapeHtml(a.url_to_image)}" alt="" class="intel-item-img" loading="lazy" />` : ""}
      </div>
    `,
      )
      .join("");
  }

  function renderFinancePanel(data) {
    const panel = getPanelContainer("finance");
    if (!panel) return;
    if (!state.layers.finance) {
      panel.innerHTML = "";
      return;
    }
    panel.innerHTML = (data || [])
      .map((f) => {
        const change = f.change_24h_pct;
        const changeClass = change != null ? (change >= 0 ? "ud-green" : "ud-red") : "";
        const arrow = change != null ? (change >= 0 ? "▲" : "▼") : "";
        return `<div class="intel-item">
        <div class="intel-item-header">
          <span class="intel-item-source">${escapeHtml(f.symbol)}</span>
          <span class="${changeClass}">${arrow} ${change != null ? `${Math.abs(change).toFixed(2)}%` : "—"}</span>
        </div>
        <div class="intel-item-title">
          $${f.price_usd != null ? f.price_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
        </div>
        <div class="intel-item-desc">
          ${f.market_cap_usd != null ? `MCap: $${(f.market_cap_usd / 1e9).toFixed(2)}B` : ""}
          ${f.volume_24h != null ? ` | Vol: $${(f.volume_24h / 1e6).toFixed(1)}M` : ""}
        </div>
      </div>`;
      })
      .join("");
  }

  function renderSocialPanel(posts) {
    const panel = getPanelContainer("social");
    if (!panel) return;
    if (!state.layers.social) {
      panel.innerHTML = "";
      return;
    }
    panel.innerHTML = (posts || [])
      .slice(0, 20)
      .map((p) => {
        const sourceBadge =
          p.source === "reddit" ? `r/${escapeHtml(p.subreddit || "")}` : "Bluesky";
        return `<div class="intel-item">
        <div class="intel-item-header">
          <span class="intel-item-source">${sourceBadge}</span>
          <span class="intel-item-time">${timeAgo(p.created_utc)}</span>
        </div>
        <div class="intel-item-title">${escapeHtml(p.title)}</div>
        <div class="intel-item-desc">
          <span class="ud-author">${escapeHtml(p.author)}</span>
          <span class="ud-separator">|</span>
          ▲${p.score}
          <span class="ud-separator">|</span>
          💬${p.num_comments}
        </div>
        ${p.thumbnail ? `<img src="${escapeHtml(p.thumbnail)}" alt="" class="intel-item-img" loading="lazy" />` : ""}
      </div>`;
      })
      .join("");
  }

  function renderSpacePanel(data) {
    const panel = getPanelContainer("space");
    if (!panel) return;
    if (!state.layers.space) {
      panel.innerHTML = "";
      return;
    }
    panel.innerHTML = (data || [])
      .slice(0, 10)
      .map((s) => {
        const typeBadge =
          s.data_type === "mars_photo"
            ? "🔴 MARS"
            : s.data_type === "apod"
              ? "🌌 APOD"
              : s.data_type === "event"
                ? "🌍 EVENT"
                : s.data_type || "";
        return `<div class="intel-item">
        <div class="intel-item-header">
          <span class="intel-item-source">${escapeHtml(s.source)}</span>
          <span class="intel-item-time">${typeBadge}</span>
        </div>
        ${s.thumbnail_url ? `<img src="${escapeHtml(s.thumbnail_url)}" alt="" class="intel-item-img" loading="lazy" />` : ""}
        <div class="intel-item-title">${escapeHtml(s.title)}</div>
        ${s.description ? `<div class="intel-item-desc">${escapeHtml(s.description.slice(0, 150))}</div>` : ""}
      </div>`;
      })
      .join("");
  }

  function renderSecurityPanel(data) {
    const panel = getPanelContainer("security");
    if (!panel) return;
    if (!state.layers.security) {
      panel.innerHTML = "";
      return;
    }
    panel.innerHTML = (data || [])
      .slice(0, 20)
      .map((t) => {
        const sevClass = t.severity ? `ud-severity-${t.severity}` : "";
        const target = t.ip_address ? t.ip_address + (t.port ? `:${t.port}` : "") : t.domain || "—";
        return `<div class="intel-item ${sevClass}">
        <div class="intel-item-header">
          <span class="intel-item-source">${escapeHtml(t.source)}</span>
          <span class="intel-item-time">${t.severity ? t.severity.toUpperCase() : ""}</span>
        </div>
        <div class="intel-item-title">${escapeHtml(target)}</div>
        <div class="intel-item-desc">
          ${t.confidence != null ? `Conf: ${t.confidence}%` : ""}
          ${t.total_reports != null ? ` | Reports: ${t.total_reports}` : ""}
          ${t.threat_type ? ` | ${escapeHtml(t.threat_type)}` : ""}
        </div>
      </div>`;
      })
      .join("");
  }

  // ===== Layer Toggle =====
  function handleLayerToggle(layerId, enabled) {
    state.layers[layerId] = enabled;

    if (!enabled) {
      clearLayerEntities(layerId);
      const panel = getPanelContainer(layerId);
      if (panel) panel.innerHTML = "";
      if (state.intervals.has(layerId)) {
        clearInterval(state.intervals.get(layerId));
        state.intervals.delete(layerId);
      }
      updateLayerMeta(layerId, 0, "OFF");
    } else {
      const cfg = LAYER_META[layerId];
      fetchLayer(layerId);
      if (!state.intervals.has(layerId)) {
        state.intervals.set(
          layerId,
          setInterval(() => fetchLayer(layerId), cfg.interval || POLL_INTERVAL_MS),
        );
      }
    }
  }

  // ===== Initialization =====
  function init() {
    const layersContainer = document.getElementById("layers-list");
    if (!layersContainer) {
      setTimeout(init, 500);
      return;
    }

    LAYER_CONFIGS.forEach((cfg) => {
      state.layers[cfg.id] = cfg.defaultOn;

      const el = document.createElement("div");
      el.className = "layer-item";
      el.dataset.layer = cfg.id;
      el.dataset.available = "true";
      el.innerHTML = `
        <div class="layer-icon">
          <svg viewBox="0 0 24 24" width="20" height="20">
            <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.3"/>
            <circle cx="12" cy="12" r="6" fill="currentColor"/>
          </svg>
        </div>
        <div class="layer-info">
          <div class="layer-name">${cfg.name}</div>
          <div class="layer-source">${cfg.source}</div>
          <div class="layer-meta">
            <span class="layer-count" id="layer-count-${cfg.id}">--</span>
            <span class="layer-status" id="layer-status-${cfg.id}">${cfg.defaultOn ? "IDLE" : "OFF"}</span>
            <span class="layer-update" id="layer-update-${cfg.id}">--</span>
          </div>
        </div>
        <label class="layer-toggle">
          <input type="checkbox" id="layer-${cfg.id}" ${cfg.defaultOn ? "checked" : ""} />
          <span class="toggle-slider"></span>
        </label>
      `;
      layersContainer.appendChild(el);
    });

    addUniversalPanels();

    document.addEventListener("change", (e) => {
      for (const cfg of LAYER_CONFIGS) {
        if (e.target.matches(`#layer-${cfg.id}`)) {
          handleLayerToggle(cfg.id, e.target.checked);
          updateActiveLayersCount();
        }
      }
    });

    // Start default-on layers
    LAYER_CONFIGS.filter((c) => c.defaultOn).forEach((cfg) => {
      handleLayerToggle(cfg.id, true);
    });

    // Hook into Cesium viewer
    const iv = setInterval(() => {
      if (window.viewer) {
        viewer = window.viewer;
        clearInterval(iv);
        initCluster(viewer);
        // Re-render active geospatial layers
        LAYER_CONFIGS.filter((c) => c.geospatial && state.layers[c.id]).forEach((cfg) => {
          const data = state.data.get(cfg.id);
          if (data) renderGeospatialLayer(cfg.id, data);
        });
      }
    }, 500);
  }

  function initCluster(cesiumViewer) {
    if (!cesiumViewer.scene) return;
    cesiumViewer.scene.clustering = new Cesium.Clustering({
      enabled: false,
      pixelRange: 60,
      minimumClusterSize: 3,
      clusterBillboards: true,
      clusterLabels: true,
      clusterPoints: true,
    });
  }

  function updateActiveLayersCount() {
    const el = document.getElementById("active-layers-count");
    if (!el) return;
    const count = Object.values(state.layers).filter(Boolean).length;
    const total = LAYER_CONFIGS.length;
    el.textContent = `${count}/${total}`;

    // Also update the existing app layer count if we can
    const appCount = document.getElementById("active-layers-count");
    if (appCount) {
      const currentText = appCount.textContent || "0/9";
      const parts = currentText.split("/");
      const existing = parseInt(parts[0], 10) || 0;
      appCount.textContent = `${existing + count}/${parseInt(parts[1], 10) + total}`;
    }
  }

  function addUniversalPanels() {
    const rightRail = document.querySelector(
      ".right-rail .rail-tab-panel, #intelligence-content, .right-rail > div:last-child",
    );
    const target = rightRail || document.querySelector(".right-rail");

    if (!target) {
      setTimeout(addUniversalPanels, 500);
      return;
    }

    const _isContent = target.id === "intelligence-content";

    const panels = [
      { id: "news", title: "📰 NEWS" },
      { id: "finance", title: "💰 FINANCE" },
      { id: "social", title: "💬 SOCIAL" },
      { id: "space", title: "🛰 SPACE" },
      { id: "security", title: "🔒 THREAT INTEL" },
    ];

    panels.forEach((p) => {
      const section = document.createElement("div");
      section.className = "intelligence-section";
      section.innerHTML = `
        <div class="intelligence-section-header ud-toggle-header" data-target="${p.id}">
          <span class="intelligence-section-title">${p.title}</span>
          <span class="ud-collapse-icon">▼</span>
        </div>
        <div class="intelligence-section-content ud-panel-content" id="ud-panel-${p.id}">
          <div class="loading-indicator">Toggle layer to activate...</div>
        </div>
      `;
      target.appendChild(section);
    });

    // Collapse/expand behavior
    target.addEventListener("click", (e) => {
      const header = e.target.closest(".ud-toggle-header");
      if (!header) return;
      const targetId = header.dataset.target;
      const content = document.getElementById(`ud-panel-${targetId}`);
      if (!content) return;
      const isHidden = content.style.display === "none";
      content.style.display = isHidden ? "" : "none";
      header.querySelector(".ud-collapse-icon").textContent = isHidden ? "▼" : "▶";
    });
  }

  // Start
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
