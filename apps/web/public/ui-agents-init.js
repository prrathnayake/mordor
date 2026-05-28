(() => {
  function initUIAgents() {
    const viewer = window.__CESIUM_VIEWER__ || window.viewer || null;

    const runtime = new UIAgentRuntime({
      cesiumViewer: viewer,
      apiBaseUrl: window.__APP_CONFIG__?.apiBaseUrl || "",
    });

    const tracer = new EventTracer(runtime);

    runtime.registerAgent("news-explorer", new NewsExplorerAgent());
    runtime.registerAgent("entity-linker", new EntityLinkerAgent());
    runtime.registerAgent("event-sequencer", new EventSequencerAgent());
    runtime.registerAgent("context-prober", new ContextProberAgent());

    hookIntoExistingEvents(tracer);

    runtime.start();
    window.__uiAgentRuntime = runtime;
    window.__uiAgentTracer = tracer;

    console.log("[UIAgents] Initialized with", runtime.agents.size, "agents");
  }

  function hookIntoExistingEvents(tracer) {
    const origSelectObject = window.selectObject;
    if (typeof origSelectObject === "function") {
      window.selectObject = (entityId) => {
        origSelectObject(entityId);
        let position = null;
        const viewer = window.__CESIUM_VIEWER__;
        if (viewer && typeof Cesium !== "undefined") {
          const entity = viewer.entities.getById(entityId);
          if (entity?.position) {
            const carto = Cesium.Cartographic.fromCartesian(
              entity.position.getValue(Cesium.JulianDate.now()),
            );
            position = {
              lat: Cesium.Math.toDegrees(carto.latitude),
              lon: Cesium.Math.toDegrees(carto.longitude),
            };
          }
        }
        tracer.trackEntitySelect(entityId, position);
      };
    }

    document.addEventListener("click", (e) => {
      const newsCluster = e.target.closest(".news-cluster");
      if (newsCluster) {
        const clusterId = newsCluster.dataset.clusterId;
        if (clusterId) {
          tracer.trackNewsClick(newsCluster, {
            url: null,
            title: newsCluster.querySelector(".news-cluster-title")?.textContent || "",
            source: newsCluster.querySelector(".news-cluster-meta span")?.textContent || "",
            clusterId: clusterId,
          });
        }
        return;
      }

      const newsDetailLink = e.target.closest("#news-detail-link");
      if (newsDetailLink) {
        tracer.trackNewsClick(newsDetailLink, {
          url: newsDetailLink.href,
          title: document.querySelector("#news-detail-content h2")?.textContent || "",
          source: "",
        });
        return;
      }

      const alertChip = e.target.closest("[data-alert-id]");
      if (alertChip) {
        const alertId = alertChip.dataset.alertId;
        if (alertId) {
          const position = null;
          tracer.trackAlertInspect(alertId, position);
        }
        return;
      }

      const incidentsBtn = e.target.closest("#incidents-btn, .incidents-trigger");
      if (incidentsBtn) {
        return;
      }
    });

    const incidentPanel = document.getElementById("incident-panel");
    if (incidentPanel) {
      const observer = new MutationObserver(() => {
        if (!incidentPanel.classList.contains("hidden")) {
          const titleEl = document.getElementById("incident-title");
          if (titleEl?.textContent && titleEl.textContent !== "--") {
            tracer.trackIncidentOpen(titleEl.textContent);
          }
        }
      });
      observer.observe(incidentPanel, { attributes: true, attributeFilter: ["class"] });
    }

    const searchInput = document.getElementById("viewport-search-input");
    if (searchInput) {
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const val = searchInput.value.trim();
          if (val.length >= 3) {
            tracer.trackSearch(val);
          }
        }
      });
    }

    const entitySearchInput = document.getElementById("entity-search");
    if (entitySearchInput) {
      entitySearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const val = entitySearchInput.value.trim();
          if (val.length >= 3) {
            tracer.trackSearch(val);
          }
        }
      });
    }

    const alertModal = document.getElementById("alert-modal");
    if (alertModal) {
      const alertObserver = new MutationObserver(() => {
        if (!alertModal.classList.contains("hidden")) {
          const detailEl = document.getElementById("alert-detail-content");
          if (detailEl) {
            const alertLink = detailEl.querySelector("[data-alert-id]");
            if (alertLink) {
              tracer.trackAlertInspect(alertLink.dataset.alertId, null);
            }
          }
        }
      });
      alertObserver.observe(alertModal, { attributes: true, attributeFilter: ["class"] });
    }

    const alertsStrip = document.getElementById("alerts-strip");
    if (alertsStrip) {
      alertsStrip.addEventListener("click", (e) => {
        const alertEl = e.target.closest("[data-alert-id]");
        if (alertEl) {
          tracer.trackAlertInspect(alertEl.dataset.alertId, null);
        }
      });
    }
  }

  function waitForDependencies() {
    let attempts = 0;
    const maxAttempts = 200;
    const check = setInterval(() => {
      attempts++;
      const viewerReady = !!(window.__CESIUM_VIEWER__ || window.viewer);
      const appReady = typeof window.selectObject === "function";
      if ((viewerReady || attempts > 20) && appReady) {
        clearInterval(check);
        initUIAgents();
      } else if (attempts >= maxAttempts) {
        clearInterval(check);
        console.warn(
          "[UIAgents] Failed to initialize: dependencies not ready after",
          maxAttempts,
          "attempts",
        );
      }
    }, 100);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForDependencies);
  } else {
    waitForDependencies();
  }
})();
