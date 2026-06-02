/**
 * UILayoutEngine — Smart positioning with collision detection, clustering, and viewport awareness
 * Prevents component overlap and intelligently arranges multiple components on screen and globe
 */
class UILayoutEngine {
  constructor(options = {}) {
    this.shop = options.shop || null;
    this.calculator = options.calculator || null;
    this.container = options.container || document.body;
    this.margin = options.margin || 12;
    this.gridSize = options.gridSize || 16;
    this.clusterDistance = options.clusterDistance || 80; // pixels for screen clustering
    this.globeClusterDistance = options.globeClusterDistance || 50000; // meters
    this.maxOffsetAttempts = options.maxOffsetAttempts || 8;
    this.strategies = new Map();
    this.clusters = new Map();
    this.registerBuiltinStrategies();
  }

  /* ── Register positioning strategy ── */
  registerStrategy(name, strategyFn) {
    this.strategies.set(name, strategyFn);
  }

  /* ── Get position for a new component ── */
  getPosition(componentType, desiredPosition, options = {}) {
    const strategy = options.strategy || this.inferStrategy(componentType);
    const strategyFn = this.strategies.get(strategy);

    if (!strategyFn) {
      console.warn(`[UILayoutEngine] Unknown strategy: ${strategy}`);
      return desiredPosition;
    }

    return strategyFn.call(this, componentType, desiredPosition, options);
  }

  /* ── Screen position strategies ── */

  // Simple collision avoidance with spiral offset
  spiralAvoid(componentType, desiredPosition, options) {
    const existing = this.getExistingScreenRects();
    let pos = { ...desiredPosition };

    for (let i = 0; i < this.maxOffsetAttempts; i++) {
      const rect = this.estimateRect(componentType, pos, options);
      if (!this.hasCollision(rect, existing)) {
        return pos;
      }
      // Spiral offset: 0°, 45°, 90°, ... with increasing radius
      const angle = (i * 45 * Math.PI) / 180;
      const radius = (Math.floor(i / 8) + 1) * (this.gridSize * 2);
      pos = {
        x: desiredPosition.x + Math.cos(angle) * radius,
        y: desiredPosition.y + Math.sin(angle) * radius,
      };
    }

    // Fallback: clamp to viewport edge
    return this.clampToViewport(pos, componentType, options);
  }

  // Grid-based placement (useful for panels)
  gridPlace(componentType, desiredPosition, options) {
    const cols = options.cols || 3;
    const cellWidth = options.cellWidth || 320;
    const cellHeight = options.cellHeight || 200;
    const padding = options.padding || this.margin;

    const existing = this.getExistingScreenRects();
    const startX = desiredPosition.x || padding;
    const startY = desiredPosition.y || padding;

    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < cols; col++) {
        const pos = {
          x: startX + col * (cellWidth + padding),
          y: startY + row * (cellHeight + padding),
        };
        const rect = this.estimateRect(componentType, pos, options);
        if (!this.hasCollision(rect, existing)) {
          return pos;
        }
      }
    }

    return this.spiralAvoid(componentType, desiredPosition, options);
  }

  // Place in a vertical stack (useful for toasts)
  stackPlace(componentType, desiredPosition, options) {
    const existing = this.getExistingScreenRects();
    const stackDirection = options.stackDirection || "down";
    const itemHeight = options.itemHeight || 60;
    const padding = options.padding || this.margin;

    let y = desiredPosition.y;
    const x = desiredPosition.x;

    for (let i = 0; i < this.maxOffsetAttempts * 2; i++) {
      const pos = { x, y };
      const rect = this.estimateRect(componentType, pos, options);
      if (!this.hasCollision(rect, existing)) {
        return pos;
      }
      y += stackDirection === "down" ? itemHeight + padding : -(itemHeight + padding);
    }

    return { x, y };
  }

  // Globe clustering: group nearby components
  clusterGlobe(_componentType, desiredPosition, options) {
    if (!this.calculator) return desiredPosition;

    const cartesian = this.calculator.toCartesian3(desiredPosition);
    if (!cartesian) return desiredPosition;

    // Find existing globe-tracked components
    const tracked = this.getTrackedGlobePositions();

    // Check if within cluster distance of any existing
    let nearestCluster = null;
    let nearestDist = Infinity;

    for (const trackedPos of tracked) {
      const dist = this.calculator.distanceMeters(desiredPosition, trackedPos);
      if (dist !== null && dist < this.globeClusterDistance && dist < nearestDist) {
        nearestDist = dist;
        nearestCluster = trackedPos;
      }
    }

    if (nearestCluster) {
      // Offset slightly from cluster center
      const _offset = options.clusterOffset || { lat: 0.002, lon: 0.002 };
      const clusterMembers = this.getClusterMembers(nearestCluster);
      const angle = (clusterMembers.length * 45 * Math.PI) / 180;
      const radius = Math.min(clusterMembers.length * 0.001, 0.01);

      return {
        lat: nearestCluster.lat + Math.sin(angle) * radius,
        lon: nearestCluster.lon + Math.cos(angle) * radius,
        height: desiredPosition.height || 0,
      };
    }

    return desiredPosition;
  }

  /* ── Collision detection ── */
  hasCollision(rect, existingRects) {
    for (const other of existingRects) {
      if (this.rectsIntersect(rect, other)) {
        return true;
      }
    }
    return false;
  }

  rectsIntersect(a, b) {
    return !(
      a.right + this.margin < b.left ||
      b.right + this.margin < a.left ||
      a.bottom + this.margin < b.top ||
      b.bottom + this.margin < a.top
    );
  }

  estimateRect(componentType, position, options) {
    const widths = {
      "globe-popup": 280,
      "info-card": 240,
      badge: 80,
      "alert-toast": 280,
      "floating-panel": parseInt(options.width, 10) || 300,
      timeline: 260,
      "video-embed": 280,
      "image-viewer": 240,
    };

    const heights = {
      "globe-popup": 160,
      "info-card": 200,
      badge: 24,
      "alert-toast": 44,
      "floating-panel": parseInt(options.height, 10) || 200,
      timeline: 220,
      "video-embed": 220,
      "image-viewer": 200,
    };

    const w = widths[componentType] || 200;
    const h = heights[componentType] || 100;

    return {
      left: position.x || 0,
      top: position.y || 0,
      right: (position.x || 0) + w,
      bottom: (position.y || 0) + h,
      width: w,
      height: h,
    };
  }

  getExistingScreenRects() {
    const rects = [];
    if (!this.shop) return rects;

    for (const instance of this.shop.instances.values()) {
      if (instance.destroyed) continue;
      if (!instance.element) continue;

      const el = instance.element;
      const style = window.getComputedStyle(el);
      if (style.display === "none") continue;

      const rect = el.getBoundingClientRect();
      rects.push({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        id: instance.id,
      });
    }

    return rects;
  }

  getTrackedGlobePositions() {
    const positions = [];
    if (!this.shop) return positions;

    for (const instance of this.shop.instances.values()) {
      if (instance.destroyed || !instance.tracked) continue;
      if (instance.config?.position?.lat !== undefined) {
        positions.push(instance.config.position);
      }
    }

    return positions;
  }

  getClusterMembers(clusterCenter) {
    const members = [];
    if (!this.shop || !this.calculator) return members;

    for (const instance of this.shop.instances.values()) {
      if (instance.destroyed || !instance.tracked) continue;
      const pos = instance.config?.position;
      if (!pos) continue;

      const dist = this.calculator.distanceMeters(pos, clusterCenter);
      if (dist !== null && dist < this.globeClusterDistance) {
        members.push(instance);
      }
    }

    return members;
  }

  clampToViewport(position, componentType, options) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const rect = this.estimateRect(componentType, position, options);

    let x = position.x || 0;
    let y = position.y || 0;

    if (x + rect.width > w) x = w - rect.width - this.margin;
    if (y + rect.height > h) y = h - rect.height - this.margin;
    if (x < this.margin) x = this.margin;
    if (y < this.margin) y = this.margin;

    return { x, y };
  }

  /* ── Cluster management ── */
  createCluster(name, centerPosition, options = {}) {
    const cluster = {
      id: name || `cluster-${Date.now()}`,
      center: centerPosition,
      members: [],
      radius: options.radius || this.globeClusterDistance,
      maxMembers: options.maxMembers || 10,
      componentType: options.componentType || "globe-popup",
    };
    this.clusters.set(cluster.id, cluster);
    return cluster;
  }

  addToCluster(clusterId, componentId) {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) return false;

    if (cluster.members.length >= cluster.maxMembers) {
      // Create sub-cluster or expand
      return false;
    }

    cluster.members.push(componentId);
    return true;
  }

  removeFromCluster(clusterId, componentId) {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) return false;

    cluster.members = cluster.members.filter((id) => id !== componentId);
    if (cluster.members.length === 0) {
      this.clusters.delete(clusterId);
    }
    return true;
  }

  /* ── Layout batch operations ── */
  layoutBatch(componentConfigs, options = {}) {
    const results = [];
    const strategy = options.strategy || "spiralAvoid";

    for (const config of componentConfigs) {
      const pos = this.getPosition(config.type, config.position || { x: 100, y: 100 }, {
        ...options,
        ...config.options,
        strategy,
      });
      results.push({ ...config, resolvedPosition: pos });
    }

    return results;
  }

  /* ── Viewport analysis ── */
  getViewportUsage() {
    const rects = this.getExistingScreenRects();
    const totalArea = window.innerWidth * window.innerHeight;
    const usedArea = rects.reduce((sum, r) => sum + r.width * r.height, 0);

    return {
      totalArea,
      usedArea,
      freeArea: totalArea - usedArea,
      usagePercent: (usedArea / totalArea) * 100,
      componentCount: rects.length,
      rects,
    };
  }

  findEmptySpace(minWidth, minHeight, options = {}) {
    const existing = this.getExistingScreenRects();
    const padding = options.padding || this.margin;
    const step = options.step || this.gridSize;

    for (let y = padding; y < window.innerHeight - minHeight - padding; y += step) {
      for (let x = padding; x < window.innerWidth - minWidth - padding; x += step) {
        const testRect = {
          left: x,
          top: y,
          right: x + minWidth,
          bottom: y + minHeight,
        };
        if (!this.hasCollision(testRect, existing)) {
          return { x, y };
        }
      }
    }

    return null;
  }

  /* ── Strategy inference ── */
  inferStrategy(componentType) {
    const map = {
      "globe-popup": "clusterGlobe",
      badge: "clusterGlobe",
      "info-card": "clusterGlobe",
      "alert-toast": "stackPlace",
      "floating-panel": "gridPlace",
      timeline: "gridPlace",
      "video-embed": "spiralAvoid",
      "image-viewer": "spiralAvoid",
    };
    return map[componentType] || "spiralAvoid";
  }

  /* ── Built-in strategies ── */
  registerBuiltinStrategies() {
    this.registerStrategy("spiralAvoid", this.spiralAvoid);
    this.registerStrategy("gridPlace", this.gridPlace);
    this.registerStrategy("stackPlace", this.stackPlace);
    this.registerStrategy("clusterGlobe", this.clusterGlobe);
  }

  /* ── Cleanup ── */
  destroy() {
    this.strategies.clear();
    this.clusters.clear();
    this.shop = null;
    this.calculator = null;
  }
}

/* ── Export ── */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { UILayoutEngine };
}
