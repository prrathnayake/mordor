import { BaseWidget, type BaseWidgetConfig } from "./base-widget.js";

export interface AlertBadgeData {
  count: number;
  severity: "critical" | "warning" | "info";
  label?: string;
  pulse?: boolean;
}

export interface BadgeConfig extends BaseWidgetConfig {
  data: AlertBadgeData;
  onClick?: (data: AlertBadgeData) => void;
}

export class AlertBadgeWidget extends BaseWidget {
  private data: AlertBadgeData;
  private onClick?: (data: AlertBadgeData) => void;

  private static SEVERITY_COLORS = {
    critical: "#ff3333",
    warning: "#ffaa00",
    info: "#3399ff",
  };

  constructor(config: BadgeConfig) {
    super(config);
    this.data = config.data;
    this.onClick = config.onClick;
  }

  override render(): HTMLElement {
    const el = document.createElement("div");
    el.className = "widget-alert-badge";
    el.style.cssText = `
      position: absolute;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 2px 6px;
      border-radius: 10px;
      font-family: var(--font-mono, Consolas, monospace);
      font-size: 10px;
      font-weight: bold;
      cursor: pointer;
      z-index: ${this.zIndex};
      transition: all 0.2s ease;
    `;

    this.updateVisuals(el);
    this.attachEvents(el);

    this.element = el;
    return el;
  }

  override update(data: AlertBadgeData): void {
    this.data = data;
    if (this.element) {
      this.updateVisuals(this.element);
    }
  }

  increment(): void {
    this.data.count++;
    this.update(this.data);
  }

  decrement(): void {
    if (this.data.count > 0) {
      this.data.count--;
      this.update(this.data);
    }
  }

  setSeverity(severity: AlertBadgeData["severity"]): void {
    this.data.severity = severity;
    this.update(this.data);
  }

  private updateVisuals(el: HTMLElement): void {
    const color = AlertBadgeWidget.SEVERITY_COLORS[this.data.severity];
    const displayCount = this.data.count > 99 ? "99+" : String(this.data.count);

    el.style.background = `${color}30`;
    el.style.color = color;
    el.style.border = `1px solid ${color}`;
    el.style.boxShadow = this.data.pulse ? `0 0 8px ${color}60` : "none";
    el.innerHTML = `
      <span>${displayCount}</span>
      ${this.data.label ? `<span style="margin-left:4px;opacity:0.8">${this.data.label}</span>` : ""}
    `;

    if (this.data.pulse) {
      el.classList.add("pulse-badge");
    } else {
      el.classList.remove("pulse-badge");
    }
  }

  private attachEvents(el: HTMLElement): void {
    el.addEventListener("click", () => {
      if (this.onClick) {
        this.onClick(this.data);
      }
    });

    el.addEventListener("mouseenter", () => {
      el.style.transform = "scale(1.1)";
    });

    el.addEventListener("mouseleave", () => {
      el.style.transform = "scale(1)";
    });
  }
}
