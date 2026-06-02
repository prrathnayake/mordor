/**
 * UIEventBus — Pub/sub event bus for inter-component and agent-to-UI communication
 * Enables decoupled, real-time coordination between all UI surfaces and external agents
 */
class UIEventBus {
  constructor(options = {}) {
    this.listeners = new Map();
    this.history = [];
    this.maxHistory = options.maxHistory || 1000;
    this.debug = options.debug || false;
    this.middlewares = [];
    this.onceListeners = new Map();
  }

  /* ── Subscribe ── */
  on(event, handler, options = {}) {
    if (typeof handler !== "function") {
      console.warn("[UIEventBus] Handler must be a function");
      return () => {};
    }

    const listeners = this.listeners.get(event) || [];
    listeners.push({ handler, options, id: this.generateId() });
    this.listeners.set(event, listeners);

    return () => this.off(event, handler);
  }

  once(event, handler, options = {}) {
    const wrapped = (data, meta) => {
      this.off(event, wrapped);
      handler(data, meta);
    };
    return this.on(event, wrapped, options);
  }

  /* ── Unsubscribe ── */
  off(event, handler) {
    const listeners = this.listeners.get(event);
    if (!listeners) return;

    const idx = listeners.findIndex((l) => l.handler === handler);
    if (idx !== -1) {
      listeners.splice(idx, 1);
      if (listeners.length === 0) {
        this.listeners.delete(event);
      }
    }
  }

  offAll(event) {
    if (event) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }

  /* ── Publish ── */
  emit(event, data, meta = {}) {
    const enrichedMeta = {
      timestamp: Date.now(),
      event,
      source: meta.source || "unknown",
      priority: meta.priority || "normal",
      ...meta,
    };

    // Run middlewares
    let payload = data;
    for (const mw of this.middlewares) {
      try {
        const result = mw(event, payload, enrichedMeta);
        if (result === false) return; // middleware blocked
        if (result !== undefined) payload = result;
      } catch (error) {
        console.warn("[UIEventBus] Middleware error:", error);
      }
    }

    // Record history
    this.history.push({ event, data: payload, meta: enrichedMeta });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Notify listeners
    const listeners = this.listeners.get(event);
    if (listeners) {
      for (const { handler, options } of listeners) {
        try {
          if (options.debounce) {
            this.debouncedCall(handler, payload, enrichedMeta, options.debounce);
          } else if (options.throttle) {
            this.throttledCall(handler, payload, enrichedMeta, options.throttle);
          } else {
            handler(payload, enrichedMeta);
          }
        } catch (error) {
          console.error("[UIEventBus] Listener error:", error);
        }
      }
    }

    // Notify wildcard listeners
    const wildcards = this.listeners.get("*");
    if (wildcards) {
      for (const { handler } of wildcards) {
        try {
          handler(event, payload, enrichedMeta);
        } catch (error) {
          console.error("[UIEventBus] Wildcard listener error:", error);
        }
      }
    }

    if (this.debug) {
      console.log(`[UIEventBus] ${event}`, payload, enrichedMeta);
    }
  }

  /* ── Middleware ── */
  use(middleware) {
    if (typeof middleware !== "function") {
      console.warn("[UIEventBus] Middleware must be a function");
      return;
    }
    this.middlewares.push(middleware);
  }

  /* ── Debounce / Throttle helpers ── */
  debouncedCall(handler, data, meta, delay) {
    const key = `${meta.event}-${handler.name}`;
    clearTimeout(this._debounceTimers?.[key]);
    if (!this._debounceTimers) this._debounceTimers = {};
    this._debounceTimers[key] = setTimeout(() => handler(data, meta), delay);
  }

  throttledCall(handler, data, meta, limit) {
    const key = `${meta.event}-${handler.name}`;
    const now = Date.now();
    if (!this._throttleTimers) this._throttleTimers = {};
    if (!this._throttleTimers[key] || now - this._throttleTimers[key] >= limit) {
      this._throttleTimers[key] = now;
      handler(data, meta);
    }
  }

  /* ── Query history ── */
  getHistory(event, limit = 50) {
    if (event) {
      return this.history.filter((h) => h.event === event).slice(-limit);
    }
    return this.history.slice(-limit);
  }

  getHistorySince(timestamp, event) {
    const filtered = this.history.filter((h) => h.meta.timestamp >= timestamp);
    if (event) return filtered.filter((h) => h.event === event);
    return filtered;
  }

  /* ── Wait for event (async) ── */
  waitFor(event, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(event, handler);
        reject(new Error(`[UIEventBus] Timeout waiting for ${event}`));
      }, timeout);

      const handler = (data, meta) => {
        clearTimeout(timer);
        resolve({ data, meta });
      };

      this.once(event, handler);
    });
  }

  /* ── Stats ── */
  stats() {
    const eventCounts = {};
    for (const [event, listeners] of this.listeners) {
      eventCounts[event] = listeners.length;
    }
    return {
      totalListeners: Object.values(eventCounts).reduce((a, b) => a + b, 0),
      eventTypes: Object.keys(eventCounts).length,
      eventCounts,
      historySize: this.history.length,
    };
  }

  /* ── Cleanup ── */
  destroy() {
    this.listeners.clear();
    this.onceListeners.clear();
    this.middlewares = [];
    this.history = [];
    if (this._debounceTimers) {
      for (const key in this._debounceTimers) {
        clearTimeout(this._debounceTimers[key]);
      }
      this._debounceTimers = null;
    }
    this._throttleTimers = null;
  }

  generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

/* ── Export ── */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { UIEventBus };
}
