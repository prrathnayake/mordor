import { BaseWidget, type BaseWidgetConfig, type Position } from "./base-widget.js";

export interface TooltipData {
  title: string;
  subtitle?: string;
  content?: string;
  icon?: string;
  color?: string;
}

export interface TooltipConfig extends BaseWidgetConfig {
  data: TooltipData;
  offsetX?: number;
  offsetY?: number;
  autoHideDelay?: number;
}

export class TooltipWidget extends BaseWidget {
  private data: TooltipData;
  private offsetX: number;
  private offsetY: number;
  private autoHideDelay?: number;
  private hideTimeout?: ReturnType<typeof setTimeout>;

  constructor(config: TooltipConfig) {
    super(config);
    this.data = config.data;
    this.offsetX = config.offsetX ?? 10;
    this.offsetY = config.offsetY ?? -30;
    this.autoHideDelay = config.autoHideDelay;
  }

  override render(): HTMLElement {
    const el = document.createElement("div");
    el.className = "widget-tooltip";
    el.style.cssText = `
      position: fixed;
      pointer-events: none;
      z-index: 9999;
      background: var(--bg-panel, rgba(18,18,26,0.95));
      border: 1px solid var(--border-color, #2a2a3a);
      border-radius: 4px;
      padding: 8px 12px;
      min-width: 120px;
      max-width: 250px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      animation: labelFadeIn 0.2s ease-out;
    `;

    const color = this.data.color || "var(--accent-primary, #00ff41)";
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        ${this.data.icon ? `<span style="font-size:14px">${this.data.icon}</span>` : ""}
        <span style="font-size:12px;font-weight:600;color:${color}">${this.escapeHtml(this.data.title)}</span>
      </div>
      ${this.data.subtitle ? `<div style="font-size:10px;color:var(--text-secondary,#888899)">${this.escapeHtml(this.data.subtitle)}</div>` : ""}
      ${this.data.content ? `<div style="font-size:11px;color:var(--text-primary,#e0e0e0);margin-top:4px">${this.escapeHtml(this.data.content)}</div>` : ""}
    `;

    this.element = el;
    return el;
  }

  override update(data: TooltipData): void {
    this.data = data;
    if (this.element) {
      const color = data.color || "var(--accent-primary, #00ff41)";
      this.element.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
          ${data.icon ? `<span style="font-size:14px">${data.icon}</span>` : ""}
          <span style="font-size:12px;font-weight:600;color:${color}">${this.escapeHtml(data.title)}</span>
        </div>
        ${data.subtitle ? `<div style="font-size:10px;color:var(--text-secondary,#888899)">${this.escapeHtml(data.subtitle)}</div>` : ""}
        ${data.content ? `<div style="font-size:11px;color:var(--text-primary,#e0e0e0);margin-top:4px">${this.escapeHtml(data.content)}</div>` : ""}
      `;
    }
  }

  setPositionScreen(x: number, y: number): void {
    if (this.element) {
      this.element.style.left = `${x + this.offsetX}px`;
      this.element.style.top = `${y + this.offsetY}px`;
    }
  }

  scheduleHide(delay?: number): void {
    const d = delay ?? this.autoHideDelay;
    if (d && d > 0) {
      this.hideTimeout = setTimeout(() => this.hide(), d);
    }
  }

  cancelScheduledHide(): void {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = undefined;
    }
  }

  private escapeHtml(str: string): string {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }
}
