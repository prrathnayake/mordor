import { BaseWidget, type BaseWidgetConfig, type Position } from "./base-widget.js";

export interface InfoCardData {
  title: string;
  subtitle?: string;
  fields?: Array<{ label: string; value: string | number }>;
  actions?: Array<{ label: string; onClick: () => void }>;
  severity?: "info" | "warning" | "critical";
  icon?: string;
  color?: string;
}

export interface CardConfig extends BaseWidgetConfig {
  data: InfoCardData;
  closable?: boolean;
  autoPosition?: boolean;
}

export class InfoCardWidget extends BaseWidget {
  private data: InfoCardData;
  private closable: boolean;
  private autoPosition: boolean;
  private onClose?: () => void;

  constructor(config: CardConfig) {
    super(config);
    this.data = config.data;
    this.closable = config.closable ?? false;
    this.autoPosition = config.autoPosition ?? true;
  }

  override render(): HTMLElement {
    const el = document.createElement("div");
    el.className = "widget-info-card";
    el.style.cssText = `
      position: absolute;
      background: var(--bg-panel, rgba(18,18,26,0.95));
      border: 1px solid var(--border-color, #2a2a3a);
      border-radius: 6px;
      padding: 12px 16px;
      min-width: 200px;
      max-width: 320px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      animation: cardSlideUp 0.3s ease-out;
      z-index: ${this.zIndex};
    `;

    if (this.data.severity) {
      const severityColors: Record<string, string> = {
        critical: "#ff3333",
        warning: "#ffaa00",
        info: "#3399ff",
      };
      el.style.borderLeft = `3px solid ${severityColors[this.data.severity] || severityColors.info}`;
    }

    const closeBtn = this.closable
      ? `<button class="card-close-btn" style="
          position:absolute;top:8px;right:8px;
          background:transparent;border:none;
          color:var(--text-dim,#555566);
          cursor:pointer;font-size:14px;
          line-height:1;
        ">×</button>`
      : "";

    const color = this.data.color || "var(--accent-primary, #00ff41)";
    let html = `
      <div class="card-header" style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;padding-right:24px">
        ${this.data.icon ? `<span style="font-size:18px">${this.data.icon}</span>` : ""}
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:${color}">${this.escapeHtml(this.data.title)}</div>
          ${this.data.subtitle ? `<div style="font-size:10px;color:var(--text-secondary,#888899);margin-top:2px">${this.escapeHtml(this.data.subtitle)}</div>` : ""}
        </div>
      </div>
      ${closeBtn}
    `;

    if (this.data.fields && this.data.fields.length > 0) {
      html += `<div class="card-fields" style="display:flex;flex-direction:column;gap:4px">`;
      for (const field of this.data.fields) {
        html += `
          <div style="display:flex;justify-content:space-between;font-size:11px">
            <span style="color:var(--text-dim,#555566)">${this.escapeHtml(field.label)}</span>
            <span style="color:var(--text-primary,#e0e0e0)">${this.escapeHtml(String(field.value))}</span>
          </div>
        `;
      }
      html += `</div>`;
    }

    if (this.data.actions && this.data.actions.length > 0) {
      html += `<div class="card-actions" style="display:flex;gap:8px;margin-top:12px;padding-top:8px;border-top:1px solid var(--border-color,#2a2a3a)">`;
      for (const action of this.data.actions) {
        html += `
          <button data-action="${this.escapeHtml(action.label)}" style="
            padding:4px 10px;
            background:var(--bg-secondary,#12121a);
            border:1px solid var(--border-color,#2a2a3a);
            border-radius:3px;
            color:var(--text-primary,#e0e0e0);
            font-family:var(--font-mono,Consolas,monospace);
            font-size:10px;
            cursor:pointer;
          ">${this.escapeHtml(action.label)}</button>
        `;
      }
      html += `</div>`;
    }

    el.innerHTML = html;

    if (this.closable) {
      const closeButton = el.querySelector(".card-close-btn");
      if (closeButton) {
        closeButton.addEventListener("click", () => {
          this.hide();
          if (this.onClose) this.onClose();
        });
      }
    }

    if (this.data.actions) {
      el.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (target.dataset.action) {
          const action = this.data.actions?.find((a) => a.label === target.dataset.action);
          if (action) action.onClick();
        }
      });
    }

    this.element = el;
    return el;
  }

  override update(data: InfoCardData): void {
    this.data = data;
    if (this.element) {
      this.element.innerHTML = "";
      this.element.appendChild(this.renderContent());
    }
  }

  setOnClose(callback: () => void): void {
    this.onClose = callback;
  }

  private renderContent(): HTMLElement {
    const color = this.data.color || "var(--accent-primary, #00ff41)";
    const content = document.createElement("div");

    const closeBtn = this.closable
      ? `<button class="card-close-btn" style="
          position:absolute;top:8px;right:8px;
          background:transparent;border:none;
          color:var(--text-dim,#555566);
          cursor:pointer;font-size:14px;
          line-height:1;
        ">×</button>`
      : "";

    content.innerHTML = `
      <div class="card-header" style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;padding-right:24px">
        ${this.data.icon ? `<span style="font-size:18px">${this.data.icon}</span>` : ""}
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600;color:${color}">${this.escapeHtml(this.data.title)}</div>
          ${this.data.subtitle ? `<div style="font-size:10px;color:var(--text-secondary,#888899);margin-top:2px">${this.escapeHtml(this.data.subtitle)}</div>` : ""}
        </div>
      </div>
      ${closeBtn}
    `;

    if (this.closable) {
      const closeButton = content.querySelector(".card-close-btn");
      if (closeButton) {
        closeButton.addEventListener("click", () => {
          this.hide();
          if (this.onClose) this.onClose();
        });
      }
    }

    return content;
  }

  private escapeHtml(str: string): string {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }
}
