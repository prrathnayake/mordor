import type { Position } from "../widgets/base-widget.js";
import type { WidgetManager } from "./widget-manager.js";

export interface MouseEventData {
  screenX: number;
  screenY: number;
  clientX: number;
  clientY: number;
}

export type HoverCallback = (
  item: Record<string, unknown> | null,
  position: Position,
  screenPos: MouseEventData,
) => void;
export type ClickCallback = (
  item: Record<string, unknown> | null,
  position: Position,
  screenPos: MouseEventData,
) => void;

export interface EventHandlersConfig {
  widgetManager: WidgetManager;
  cesiumViewer: unknown;
  pickRadius?: number;
}

export class EventHandlers {
  private widgetManager: WidgetManager;
  private cesiumViewer: unknown;
  private pickRadius: number;
  private currentHoveredItem: Record<string, unknown> | null = null;
  private currentHoveredPosition: Position | null = null;
  private mouseMoveThrottle: ReturnType<typeof setTimeout> | null = null;
  private lastMousePos: MouseEventData | null = null;
  private enabled: boolean = true;

  constructor(config: EventHandlersConfig) {
    this.widgetManager = config.widgetManager;
    this.cesiumViewer = config.cesiumViewer;
    this.pickRadius = config.pickRadius ?? 15;
  }

  attach(container: HTMLElement): void {
    container.addEventListener("mousemove", this.handleMouseMove.bind(this));
    container.addEventListener("click", this.handleClick.bind(this));
    container.addEventListener("mouseleave", this.handleMouseLeave.bind(this));
  }

  detach(container: HTMLElement): void {
    container.removeEventListener("mousemove", this.handleMouseMove.bind(this));
    container.removeEventListener("click", this.handleClick.bind(this));
    container.removeEventListener("mouseleave", this.handleMouseLeave.bind(this));
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clearHover();
    }
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.enabled) return;

    if (this.mouseMoveThrottle) {
      return;
    }

    this.mouseMoveThrottle = setTimeout(() => {
      this.mouseMoveThrottle = null;
    }, 50);

    this.lastMousePos = {
      screenX: event.clientX,
      screenY: event.clientY,
      clientX: event.clientX,
      clientY: event.clientY,
    };

    this.handleHover(event);
  }

  private handleHover(event: MouseEvent): void {
    const screenX = event.clientX;
    const screenY = event.clientY;

    const pickedItem = this.pickItem(screenX, screenY);

    if (pickedItem && pickedItem.item) {
      if (this.currentHoveredItem !== pickedItem.item) {
        this.currentHoveredItem = pickedItem.item;
        this.currentHoveredPosition = pickedItem.position;

        this.widgetManager.hoverCallbacks.forEach((callback) => {
          callback(pickedItem.item, pickedItem.position);
        });
      }
    } else {
      this.clearHover();
    }
  }

  private handleClick(event: MouseEvent): void {
    if (!this.enabled) return;

    const screenX = event.clientX;
    const screenY = event.clientY;

    const pickedItem = this.pickItem(screenX, screenY);

    if (pickedItem && pickedItem.item) {
      this.widgetManager.clickCallbacks.forEach((callback) => {
        callback(pickedItem.item, pickedItem.position);
      });
    }
  }

  private handleMouseLeave(_event: MouseEvent): void {
    this.clearHover();
  }

  private clearHover(): void {
    if (this.currentHoveredItem !== null) {
      this.currentHoveredItem = null;
      this.currentHoveredPosition = null;

      this.widgetManager.hoverCallbacks.forEach((callback) => {
        callback(null, { lat: 0, lon: 0 });
      });
    }
  }

  private pickItem(
    screenX: number,
    screenY: number,
  ): { item: Record<string, unknown>; position: Position } | null {
    if (!this.cesiumViewer) {
      return null;
    }

    const viewer = this.cesiumViewer as {
      scene: {
        pick: (
          x: number,
          y: number,
        ) =>
          | {
              id?: {
                properties?: Record<string, unknown>;
              };
              cartographic?: {
                latitude: number;
                longitude: number;
                height: number;
              };
            }
          | undefined;
      };
    };

    try {
      const pick = viewer.scene.pick(screenX, screenY);

      if (pick && pick.id) {
        const entity = pick.id;
        if (entity.properties) {
          const item: Record<string, unknown> = {};
          for (const key of Object.keys(entity.properties)) {
            item[key] = entity.properties[key];
          }

          return {
            item,
            position: {
              lat: pick.cartographic?.latitude ?? 0,
              lon: pick.cartographic?.longitude ?? 0,
              alt: pick.cartographic?.height ?? 0,
            },
          };
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  setPickRadius(radius: number): void {
    this.pickRadius = radius;
  }
}

export function createEventHandlers(config: EventHandlersConfig): EventHandlers {
  return new EventHandlers(config);
}
