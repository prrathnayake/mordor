/**
 * UIComponentShop — Centralized registry and factory for dynamic UI components
 * Manages creation, positioning, lifecycle, and cleanup of all dynamic UI surfaces
 */
class UIComponentShop {
  constructor(options = {}) {
    this.viewer = options.viewer || null;
    this.container = options.container || document.body;
    this.calculator = options.calculator || null;
    this.registry = new Map();
    this.instances = new Map();
    this.listeners = new Map();
    this.zIndexBase = options.zIndexBase || 1000;
    this.autoTrackGlobe = options.autoTrackGlobe !== false;
  }

  /* ── Registry ── */
  register(type, config) {
    if (typeof config.factory !== "function") {
      throw new Error(`[UIComponentShop] ${type}: factory must be a function`);
    }
    this.registry.set(type, {
      factory: config.factory,
      defaultConfig: config.defaultConfig || {},
      defaultZIndex: config.defaultZIndex || this.zIndexBase,
      supportsGlobePosition: config.supportsGlobePosition ?? true,
      supportsScreenPosition: config.supportsScreenPosition ?? true,
    });
    return this;
  }

  unregister(type) {
    // Destroy all instances of this type first
    for (const [id, instance] of this.instances) {
      if (instance.type === type) this.destroy(id);
    }
    this.registry.delete(type);
    return this;
  }

  /* ── Creation ── */
  create(type, config = {}) {
    const reg = this.registry.get(type);
    if (!reg) {
      console.warn(`[UIComponentShop] Unknown component type: ${type}`);
      return null;
    }

    const id = config.id || `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    // Merge configs
    const merged = { ...reg.defaultConfig, ...config, id, type };

    // Create DOM element via factory
    const element = reg.factory(merged);
    if (!element) {
      console.warn(`[UIComponentShop] ${type} factory returned null`);
      return null;
    }

    // Style basics
    element.id = id;
    element.style.position = config.positionType || "absolute";
    element.style.zIndex = merged.zIndex || reg.defaultZIndex;
    element.dataset.componentType = type;
    element.dataset.componentId = id;

    // Position
    if (merged.position) {
      this.position(element, merged.position, merged.positionType);
    }

    // Append to container
    const targetContainer = merged.container || this.container;
    targetContainer.appendChild(element);

    // Store instance
    const instance = {
      id,
      type,
      element,
      config: merged,
      createdAt: Date.now(),
      listeners: [],
      tracked: false,
      visible: true,
      destroyed: false,
    };

    this.instances.set(id, instance);

    // Track on globe if needed
    if (this.autoTrackGlobe && merged.position && reg.supportsGlobePosition) {
      this.trackGlobe(id);
    }

    // Call lifecycle hook
    if (typeof merged.onCreate === "function") {
      merged.onCreate(instance);
    }

    return instance;
  }

  /* ── Positioning ── */
  position(element, positionInput, positionType = "globe") {
    if (!this.calculator || !this.viewer) {
      // Fallback: direct pixel positioning
      if (typeof positionInput.x === "number" && typeof positionInput.y === "number") {
        element.style.left = `${positionInput.x}px`;
        element.style.top = `${positionInput.y}px`;
      }
      return;
    }

    if (positionType === "globe" || positionType === "world") {
      const screen = this.calculator.toScreen(positionInput);
      if (screen) {
        element.style.left = `${screen.x}px`;
        element.style.top = `${screen.y}px`;
        element.dataset.positionType = "globe";
      }
    } else if (positionType === "screen" || positionType === "pixel") {
      element.style.left = `${positionInput.x}px`;
      element.style.top = `${positionInput.y}px`;
      element.dataset.positionType = "screen";
    } else if (positionType === "fixed") {
      element.style.position = "fixed";
      element.style.left = `${positionInput.x ?? 0}px`;
      element.style.top = `${positionInput.y ?? 0}px`;
    } else if (positionType === "css") {
      // Apply arbitrary CSS positioning
      Object.assign(element.style, positionInput);
    }
  }

  /* ── Globe tracking ── */
  trackGlobe(id) {
    const instance = this.instances.get(id);
    if (!instance || instance.tracked || instance.destroyed) return false;

    const reg = this.registry.get(instance.type);
    if (!reg?.supportsGlobePosition) return false;

    if (!this.viewer || !this.calculator) {
      console.warn("[UIComponentShop] Cannot track globe: viewer or calculator missing");
      return false;
    }

    const listener = () => {
      if (instance.destroyed) return;

      const pos = instance.config.position;
      if (!pos) return;

      const screen = this.calculator.toScreen(pos);
      if (screen) {
        const isVis = this.calculator.isVisible(pos);
        instance.element.style.display = isVis ? "" : "none";
        if (isVis) {
          instance.element.style.left = `${screen.x}px`;
          instance.element.style.top = `${screen.y}px`;
        }
      } else {
        instance.element.style.display = "none";
      }
    };

    this.viewer.scene.postRender.addEventListener(listener);
    instance.listeners.push({ type: "postRender", fn: listener });
    instance.tracked = true;

    return true;
  }

  untrackGlobe(id) {
    const instance = this.instances.get(id);
    if (!instance?.tracked) return false;

    const postRenderListener = instance.listeners.find((l) => l.type === "postRender");
    if (postRenderListener && this.viewer) {
      this.viewer.scene.postRender.removeEventListener(postRenderListener.fn);
      instance.listeners = instance.listeners.filter((l) => l !== postRenderListener);
    }

    instance.tracked = false;
    return true;
  }

  /* ── Updates ── */
  update(id, updates) {
    const instance = this.instances.get(id);
    if (!instance || instance.destroyed) return false;

    // Merge config
    Object.assign(instance.config, updates);

    // Update position if changed
    if (updates.position) {
      this.position(instance.element, updates.position, instance.config.positionType);
      if (instance.tracked && !this.autoTrackGlobe) {
        // Re-track with new position
        this.untrackGlobe(id);
        this.trackGlobe(id);
      }
    }

    // Update content/data if factory supports refresh
    if (typeof instance.config.onUpdate === "function") {
      instance.config.onUpdate(instance, updates);
    }

    return true;
  }

  /* ── Show / Hide ── */
  show(id) {
    const instance = this.instances.get(id);
    if (!instance || instance.destroyed) return false;
    instance.element.style.display = "";
    instance.visible = true;
    if (typeof instance.config.onShow === "function") {
      instance.config.onShow(instance);
    }
    return true;
  }

  hide(id) {
    const instance = this.instances.get(id);
    if (!instance || instance.destroyed) return false;
    instance.element.style.display = "none";
    instance.visible = false;
    if (typeof instance.config.onHide === "function") {
      instance.config.onHide(instance);
    }
    return true;
  }

  /* ── Destroy ── */
  destroy(id) {
    const instance = this.instances.get(id);
    if (!instance || instance.destroyed) return false;

    instance.destroyed = true;

    // Call lifecycle hook
    if (typeof instance.config.onDestroy === "function") {
      instance.config.onDestroy(instance);
    }

    // Remove all listeners
    if (this.viewer) {
      for (const listener of instance.listeners) {
        if (listener.type === "postRender") {
          this.viewer.scene.postRender.removeEventListener(listener.fn);
        }
      }
    }
    instance.listeners = [];

    // Remove DOM
    if (instance.element?.parentNode) {
      instance.element.parentNode.removeChild(instance.element);
    }

    this.instances.delete(id);
    return true;
  }

  destroyByType(type) {
    let count = 0;
    for (const [id, instance] of this.instances) {
      if (instance.type === type) {
        this.destroy(id);
        count++;
      }
    }
    return count;
  }

  destroyAll() {
    for (const [id] of this.instances) {
      this.destroy(id);
    }
  }

  /* ── Queries ── */
  get(id) {
    return this.instances.get(id) || null;
  }

  getByType(type) {
    const results = [];
    for (const instance of this.instances.values()) {
      if (instance.type === type && !instance.destroyed) {
        results.push(instance);
      }
    }
    return results;
  }

  getVisible() {
    return Array.from(this.instances.values()).filter((i) => i.visible && !i.destroyed);
  }

  getTracked() {
    return Array.from(this.instances.values()).filter((i) => i.tracked && !i.destroyed);
  }

  getCount(type) {
    return this.getByType(type).length;
  }

  /* ── Agent manifest registration ── */
  registerFromManifest(manifest) {
    if (!manifest?.type || !manifest.factory) {
      console.warn("[UIComponentShop] Invalid manifest:", manifest);
      return false;
    }

    // For security, manifest factory must be a string that we eval
    // In production, use a proper sandbox
    let factoryFn;
    try {
      factoryFn = new Function("config", manifest.factory);
    } catch (error) {
      console.warn("[UIComponentShop] Failed to parse manifest factory:", error);
      return false;
    }

    this.register(manifest.type, {
      factory: factoryFn,
      defaultConfig: manifest.defaultConfig || {},
      defaultZIndex: manifest.defaultZIndex || this.zIndexBase,
      supportsGlobePosition: manifest.supportsGlobePosition ?? true,
      supportsScreenPosition: manifest.supportsScreenPosition ?? true,
    });

    return true;
  }

  /* ── Utility ── */
  bringToFront(id) {
    const instance = this.instances.get(id);
    if (!instance || instance.destroyed) return false;

    // Find current max z-index
    let maxZ = this.zIndexBase;
    for (const inst of this.instances.values()) {
      if (!inst.destroyed) {
        const z = parseInt(inst.element.style.zIndex, 10) || this.zIndexBase;
        if (z > maxZ) maxZ = z;
      }
    }

    instance.element.style.zIndex = maxZ + 1;
    return true;
  }

  /* ── Batch operations ── */
  createBatch(type, configs) {
    return configs.map((config) => this.create(type, config));
  }

  updateBatch(updates) {
    // updates = { id1: {...}, id2: {...} }
    const results = {};
    for (const [id, data] of Object.entries(updates)) {
      results[id] = this.update(id, data);
    }
    return results;
  }

  /* ── Cleanup ── */
  dispose() {
    this.destroyAll();
    this.registry.clear();
    this.instances.clear();
    this.listeners.clear();
    this.viewer = null;
    this.container = null;
    this.calculator = null;
  }
}

/* ── Export for module systems ── */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { UIComponentShop };
}
