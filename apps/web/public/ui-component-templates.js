/**
 * UIComponentTemplates — Schema-driven component factory for agent-safe UI creation
 * Agents fill a template schema; the system generates safe DOM without arbitrary HTML
 */
class UIComponentTemplates {
  constructor() {
    this.templates = new Map();
    this.registerBuiltinTemplates();
  }

  /* ── Register template ── */
  register(name, schema) {
    if (!schema?.fields) {
      console.warn("[UIComponentTemplates] Template must have fields array:", name);
      return false;
    }
    this.templates.set(name, {
      name,
      componentType: schema.componentType || "globe-popup",
      fields: schema.fields,
      validator: schema.validator || null,
      defaults: schema.defaults || {},
      layoutHint: schema.layoutHint || "auto",
    });
    return true;
  }

  unregister(name) {
    return this.templates.delete(name);
  }

  /* ── Create component from template + data ── */
  createFromTemplate(templateName, data, shop, calculator) {
    const template = this.templates.get(templateName);
    if (!template) {
      console.warn(`[UIComponentTemplates] Unknown template: ${templateName}`);
      return null;
    }

    // Validate
    const validation = this.validateData(template, data);
    if (!validation.valid) {
      console.warn("[UIComponentTemplates] Validation failed:", validation.errors);
      return null;
    }

    // Merge with defaults
    const merged = { ...template.defaults, ...data };

    // Build component config based on componentType
    const config = this.buildConfig(template, merged, calculator);
    if (!config) return null;

    // Create via shop
    if (!shop) {
      console.warn("[UIComponentTemplates] No shop provided, returning config only");
      return { config, template };
    }

    return shop.create(template.componentType, config);
  }

  /* ── Validate data against template schema ── */
  validateData(template, data) {
    const errors = [];
    const validated = {};

    for (const field of template.fields) {
      const value = data[field.key];

      // Required check
      if (field.required && (value === undefined || value === null || value === "")) {
        errors.push(`Missing required field: ${field.key}`);
        continue;
      }

      if (value === undefined) continue;

      // Type check
      if (field.type && !this.checkType(value, field.type)) {
        errors.push(`Field ${field.key} must be ${field.type}, got ${typeof value}`);
        continue;
      }

      // Enum check
      if (field.enum && !field.enum.includes(value)) {
        errors.push(`Field ${field.key} must be one of: ${field.enum.join(", ")}`);
        continue;
      }

      // Sanitize strings
      if (field.type === "string" && typeof value === "string") {
        validated[field.key] = field.allowHtml ? value : this.escapeHtml(value);
      } else {
        validated[field.key] = value;
      }
    }

    // Custom validator
    if (template.validator && typeof template.validator === "function") {
      try {
        const customResult = template.validator(validated);
        if (customResult !== true) {
          errors.push(...(Array.isArray(customResult) ? customResult : [String(customResult)]));
        }
      } catch (error) {
        errors.push(`Validator error: ${error.message}`);
      }
    }

    return { valid: errors.length === 0, errors, data: validated };
  }

  /* ── Build component config from validated data ── */
  buildConfig(template, data, calculator) {
    const base = {
      id: data.id || `${template.name}-${Date.now()}`,
    };

    // Position handling
    if (data.position) {
      const pos = this.normalizePosition(data.position, calculator);
      if (pos) base.position = pos;
    }

    switch (template.componentType) {
      case "globe-popup":
        return this.buildGlobePopupConfig(base, data);
      case "info-card":
        return this.buildInfoCardConfig(base, data);
      case "badge":
        return this.buildBadgeConfig(base, data);
      case "alert-toast":
        return this.buildAlertToastConfig(base, data);
      case "timeline":
        return this.buildTimelineConfig(base, data);
      case "floating-panel":
        return this.buildFloatingPanelConfig(base, data);
      default:
        return { ...base, ...data };
    }
  }

  buildGlobePopupConfig(base, data) {
    return {
      ...base,
      title: data.title || "Untitled",
      content: data.content || data.description || "",
      severity: data.severity || "info",
      closable: data.closable !== false,
      footer: data.footer || "",
    };
  }

  buildInfoCardConfig(base, data) {
    const fields = [];
    if (data.fields) {
      for (const [key, value] of Object.entries(data.fields)) {
        fields.push({ label: key, value: String(value) });
      }
    }

    const actions = (data.actions || []).map((a) => ({
      id: a.id || a.actionType,
      label: a.label,
      handler: a.handler || (() => {}),
    }));

    return {
      ...base,
      title: data.title || "",
      imageUrl: data.imageUrl,
      fields,
      actions,
    };
  }

  buildBadgeConfig(base, data) {
    return {
      ...base,
      label: data.label || "",
      severity: data.severity || "info",
      size: data.size || "normal",
    };
  }

  buildAlertToastConfig(base, data) {
    return {
      ...base,
      position: data.position || { x: 20, y: 20 },
      positionType: "fixed",
      message: data.message || data.title || "",
      severity: data.severity || "info",
      duration: data.duration || 5000,
    };
  }

  buildTimelineConfig(base, data) {
    return {
      ...base,
      title: data.title || "Timeline",
      events: (data.events || []).map((e) => ({
        time: e.time || e.timestamp || "",
        label: e.label || e.title || "",
        severity: e.severity || "info",
      })),
    };
  }

  buildFloatingPanelConfig(base, data) {
    return {
      ...base,
      position: data.position || { x: 100, y: 100 },
      positionType: data.positionType || "fixed",
      title: data.title || "Panel",
      content: data.content || "",
      width: data.width || "300px",
      height: data.height || "auto",
      draggable: data.draggable !== false,
      closable: data.closable !== false,
    };
  }

  /* ── Normalize position from various formats ── */
  normalizePosition(position, calculator) {
    // Already normalized
    if (position.lat !== undefined && position.lon !== undefined) {
      return { lat: position.lat, lon: position.lon, height: position.height || 0 };
    }
    // Cartesian3
    if (calculator && typeof Cesium !== "undefined" && position instanceof Cesium.Cartesian3) {
      return calculator.toLatLon(position);
    }
    // Address string
    if (typeof position === "string" && calculator) {
      const cached = calculator.geocodeCache?.get(position);
      if (cached) return cached;
    }
    return null;
  }

  /* ── Type checking ── */
  checkType(value, expectedType) {
    const typeMap = {
      string: "string",
      number: "number",
      boolean: "boolean",
      array: "object",
      object: "object",
      latlon: "object",
      url: "string",
      enum: "string",
    };

    const actual = Array.isArray(value) ? "array" : typeof value;
    if (expectedType === "latlon") {
      return (
        typeof value === "object" &&
        value !== null &&
        ("lat" in value || "latitude" in value) &&
        ("lon" in value || "longitude" in value)
      );
    }
    if (expectedType === "url") {
      return typeof value === "string" && /^https?:\/\//.test(value);
    }
    return actual === typeMap[expectedType];
  }

  escapeHtml(str) {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ── Builtin templates ── */
  registerBuiltinTemplates() {
    this.register("incident-card", {
      componentType: "info-card",
      fields: [
        { key: "id", type: "string", required: true },
        { key: "title", type: "string", required: true },
        {
          key: "severity",
          type: "string",
          enum: ["critical", "high", "medium", "low"],
          required: true,
        },
        { key: "position", type: "latlon", required: true },
        { key: "description", type: "string" },
        { key: "timestamp", type: "string" },
        { key: "imageUrl", type: "url" },
        { key: "source", type: "string" },
      ],
      defaults: {
        severity: "medium",
        closable: true,
      },
    });

    this.register("flight-tracker", {
      componentType: "badge",
      fields: [
        { key: "id", type: "string", required: true },
        { key: "label", type: "string", required: true },
        { key: "position", type: "latlon", required: true },
        { key: "severity", type: "string", enum: ["critical", "warning", "info", "success"] },
        { key: "size", type: "string", enum: ["small", "normal", "large"] },
      ],
      defaults: {
        severity: "info",
        size: "normal",
      },
    });

    this.register("breaking-alert", {
      componentType: "alert-toast",
      fields: [
        { key: "id", type: "string", required: true },
        { key: "message", type: "string", required: true },
        { key: "severity", type: "string", enum: ["critical", "warning", "info", "success"] },
        { key: "duration", type: "number" },
      ],
      defaults: {
        severity: "info",
        duration: 10000,
      },
    });

    this.register("intelligence-summary", {
      componentType: "globe-popup",
      fields: [
        { key: "id", type: "string", required: true },
        { key: "title", type: "string", required: true },
        { key: "position", type: "latlon", required: true },
        { key: "content", type: "string", required: true },
        { key: "severity", type: "string", enum: ["critical", "warning", "info", "success"] },
        { key: "footer", type: "string" },
      ],
      defaults: {
        severity: "info",
        closable: true,
      },
    });

    this.register("event-timeline", {
      componentType: "timeline",
      fields: [
        { key: "id", type: "string", required: true },
        { key: "title", type: "string", required: true },
        { key: "events", type: "array", required: true },
        { key: "position", type: "latlon" },
      ],
      defaults: {
        title: "Timeline",
      },
    });

    this.register("source-panel", {
      componentType: "floating-panel",
      fields: [
        { key: "id", type: "string", required: true },
        { key: "title", type: "string", required: true },
        { key: "content", type: "string", required: true },
        { key: "width", type: "string" },
        { key: "height", type: "string" },
      ],
      defaults: {
        width: "320px",
        draggable: true,
        closable: true,
      },
    });
  }

  /* ── List available templates ── */
  listTemplates() {
    return Array.from(this.templates.keys()).map((name) => {
      const t = this.templates.get(name);
      return {
        name,
        componentType: t.componentType,
        requiredFields: t.fields.filter((f) => f.required).map((f) => f.key),
        optionalFields: t.fields.filter((f) => !f.required).map((f) => f.key),
      };
    });
  }

  /* ── Export schema for external agents ── */
  getSchema(name) {
    const template = this.templates.get(name);
    if (!template) return null;
    return {
      name: template.name,
      componentType: template.componentType,
      fields: template.fields.map((f) => ({
        key: f.key,
        type: f.type,
        required: f.required || false,
        enum: f.enum || null,
        description: f.description || "",
      })),
      defaults: template.defaults,
    };
  }
}

/* ── Export ── */
if (typeof module !== "undefined" && module.exports) {
  module.exports = { UIComponentTemplates };
}
