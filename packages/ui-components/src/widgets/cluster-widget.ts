import { BaseWidget, type BaseWidgetConfig, type Position } from "./base-widget.js";

export interface ClusterData {
  count: number;
  label?: string;
  color?: string;
  expanded?: boolean;
}

export interface ClusterConfig extends BaseWidgetConfig {
  data: ClusterData;
  onClick?: (cluster: ClusterData, position: Position) => void;
  onHover?: (cluster: ClusterData | null) => void;
}

export class ClusterWidget extends BaseWidget {
  private data: ClusterData;
  private onClick?: (cluster: ClusterData, position: Position) => void;
  private onHover?: (cluster: ClusterData | null) => void;
  private markers: HTMLElement[] = [];
  private expanded: boolean = false;

  constructor(config: ClusterConfig) {
    super(config);
    this.data = config.data;
    this.onClick = config.onClick;
    this.onHover = config.onHover;
    this.expanded = config.data.expanded ?? false;
  }

  override render(): HTMLElement {
    const el = document.createElement("div");
    el.className = "widget-cluster";
    el.style.cssText = `
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      cursor: pointer;
      transition: transform 0.2s ease;
      z-index: ${this.zIndex};
    `;

    this.updateVisuals(el);
    this.attachEvents(el);

    this.element = el;
    return el;
  }

  override update(data: ClusterData): void {
    this.data = data;
    if (this.element) {
      this.updateVisuals(this.element);
    }
  }

  expand(): void {
    this.expanded = true;
    if (this.element) {
      this.element.classList.add("cluster-expanded");
    }
  }

  collapse(): void {
    this.expanded = false;
    if (this.element) {
      this.element.classList.remove("cluster-expanded");
    }
  }

  toggle(): void {
    if (this.expanded) {
      this.collapse();
    } else {
      this.expand();
    }
  }

  private updateVisuals(el: HTMLElement): void {
    const count = this.data.count;
    const color = this.data.color || "var(--accent-primary, #00ff41)";
    const baseSize = Math.min(20 + Math.log2(count + 1) * 8, 60);
    const size = this.expanded ? baseSize * 1.5 : baseSize;

    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.background = color;
    el.style.opacity = count > 100 ? "0.8" : "0.9";
    el.style.boxShadow = `0 0 ${count > 50 ? 15 : 10}px ${color}50`;
    el.style.border = `2px solid ${color}`;
    el.style.animation = "clusterExpand 0.3s ease-out";

    const label = this.data.label || (count > 999 ? "999+" : String(count));
    el.innerHTML = `
      <span style="
        font-family: var(--font-mono, Consolas, monospace);
        font-size: ${size > 35 ? 12 : 10}px;
        font-weight: bold;
        color: var(--text-inverse, #0a0a0f);
      ">${label}</span>
    `;
  }

  private attachEvents(el: HTMLElement): void {
    el.addEventListener("click", () => {
      if (this.onClick) {
        this.onClick(this.data, this.position);
      }
    });

    el.addEventListener("mouseenter", () => {
      el.style.transform = "scale(1.15)";
      if (this.onHover) {
        this.onHover(this.data);
      }
    });

    el.addEventListener("mouseleave", () => {
      el.style.transform = "scale(1)";
      if (this.onHover) {
        this.onHover(null);
      }
    });
  }
}
