(() => {
  if (typeof Cesium === "undefined" || typeof Cesium.Viewer !== "function") {
    console.warn("[UIAgents] Cesium not available, cannot capture viewer");
    return;
  }
  const OrigViewer = Cesium.Viewer;
  let captured = false;
  function CapturedViewer(container, options) {
    const instance = new OrigViewer(container, options);
    if (!captured) {
      captured = true;
      window.__CESIUM_VIEWER__ = instance;
      window.viewer = instance;
    }
    return instance;
  }
  CapturedViewer.prototype = OrigViewer.prototype;
  const propNames = Object.getOwnPropertyNames(OrigViewer);
  for (let i = 0; i < propNames.length; i++) {
    const prop = propNames[i];
    if (prop !== "prototype" && prop !== "length" && prop !== "name") {
      try {
        CapturedViewer[prop] = OrigViewer[prop];
      } catch (_e) {
        /* skip */
      }
    }
  }
  Cesium.Viewer = CapturedViewer;
})();
