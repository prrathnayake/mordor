import {
  getZoomBehavior,
  ZoomAnimationController,
  type ZoomLevelBehavior,
} from "../animations/zoom-animations.js";
import { BaseWidget, type Position } from "../widgets/base-widget.js";
import type { ClusterWidget } from "../widgets/cluster-widget.js";
import type { InfoCardWidget } from "../widgets/info-card-widget.js";
import type { TooltipWidget } from "../widgets/tooltip-widget.js";
import { CesiumWidgetLayer, type CesiumWidgetLayerConfig } from "./cesium-widget-layer.js";

export interface WidgetManagerConfig {
  container: HTMLElement;
  cesiumViewer: unknown;
}

export class WidgetManager {
  private container: HTMLElement;
  private cesiumViewer: unknown;
  private layers: Map<string, CesiumWidgetLayer> = new Map();
  private zoomController: ZoomAnimationController;
  private activeTooltips: Map<string, TooltipWidget> = new Map();
  private activeCards: Map<string, InfoCardWidget> = new Map();
  private onHoverCallbacks: Array<
    (item: Record<string, unknown> | null, position: Position) => void
  > = [];
  private onClickCallbacks: Array<
    (item: Record<string, unknown> | null, position: Position) => void
  > = [];

  constructor(config: WidgetManagerConfig) {
    this.container = config.container;
    this.cesiumViewer = config.cesiumViewer;
    this.zoomController = new ZoomAnimationController();

    this.zoomController.onZoomChange((zoom, behavior) => {
      this.onZoomChange(zoom, behavior);
    });
  }

  createLayer(layerId: string, color: string, outlineColor: string): CesiumWidgetLayer {
    let layer = this.layers.get(layerId);
    if (!layer) {
      layer = new CesiumWidgetLayer({
        layerId,
        color,
        outlineColor,
        cesiumViewer: this.cesiumViewer,
      });
      this.layers.set(layerId, layer);
    }
    return layer;
  }

  getLayer(layerId: string): CesiumWidgetLayer | undefined {
    return this.layers.get(layerId);
  }

  removeLayer(layerId: string): void {
    const layer = this.layers.get(layerId);
    if (layer) {
      layer.clearWidgets();
      this.layers.delete(layerId);
    }
  }

  clearAllLayers(): void {
    this.layers.forEach((layer) => layer.clearWidgets());
    this.layers.clear();
  }

  showTooltip(widget: TooltipWidget, screenX: number, screenY: number): void {
    const id = widget.id;
    const existing = this.activeTooltips.get(id);
    if (existing) {
      existing.cancelScheduledHide();
      existing.show();
      existing.setPositionScreen(screenX, screenY);
    } else {
      widget.render();
      this.container.appendChild(widget.element!);
      widget.setPositionScreen(screenX, screenY);
      this.activeTooltips.set(id, widget);
    }
  }

  hideTooltip(id: string): void {
    const tooltip = this.activeTooltips.get(id);
    if (tooltip) {
      tooltip.scheduleHide();
    }
  }

  hideAllTooltips(): void {
    this.activeTooltips.forEach((tooltip) => tooltip.hide());
  }

  showCard(card: InfoCardWidget, screenPosition: Position): void {
    const id = card.id;
    const existing = this.activeCards.get(id);
    if (existing) {
      existing.show();
    } else {
      card.render();
      this.positionCardOnScreen(card.element!, screenPosition);
      this.container.appendChild(card.element!);
      this.activeCards.set(id, card);
    }
  }

  hideCard(id: string): void {
    const card = this.activeCards.get(id);
    if (card) {
      card.hide();
    }
  }

  hideAllCards(): void {
    this.activeCards.forEach((card) => card.hide());
  }

  registerHoverCallback(
    callback: (item: Record<string, unknown> | null, position: Position) => void,
  ): () => void {
    this.onHoverCallbacks.push(callback);
    return () => {
      const index = this.onHoverCallbacks.indexOf(callback);
      if (index > -1) {
        this.onHoverCallbacks.splice(index, 1);
      }
    };
  }

  registerClickCallback(
    callback: (item: Record<string, unknown> | null, position: Position) => void,
  ): () => void {
    this.onClickCallbacks.push(callback);
    return () => {
      const index = this.onClickCallbacks.indexOf(callback);
      if (index > -1) {
        this.onClickCallbacks.splice(index, 1);
      }
    };
  }

  // Public accessors for event handlers
  get hoverCallbacks(): Array<(item: Record<string, unknown> | null, position: Position) => void> {
    return this.onHoverCallbacks;
  }

  get clickCallbacks(): Array<(item: Record<string, unknown> | null, position: Position) => void> {
    return this.onClickCallbacks;
  }

  setZoomLevel(zoom: number): void {
    this.zoomController.setZoom(zoom);
  }

  getZoomController(): ZoomAnimationController {
    return this.zoomController;
  }

  private onZoomChange(zoom: number, behavior: ZoomLevelBehavior): void {
    if (zoom <= 4) {
      this.hideAllTooltips();
      this.hideAllCards();
    }

    this.layers.forEach((layer) => {
      layer.setZoomLevel(zoom);
    });
  }

  private positionCardOnScreen(element: HTMLElement, position: Position): void {
    const rect = element.getBoundingClientRect();
    let x = 20;
    let y = 20;

    if (position.lat != null && position.lon != null && this.cesiumViewer) {
      const viewer = this.cesiumViewer as {
        scene: {
          mapPick矩形: (x: number, y: number) => unknown;
        };
        camera: {
          pick: (coord: unknown) => unknown;
        };
      };

      if (viewer.camera) {
        try {
          const cartesian = viewer.camera.pick(
            Cesium.Cartesian3.fromDegrees(position.lon, position.lat, position.alt ?? 0),
          );
          if (cartesian) {
            const windowPosition = this.worldToWindow(cartesian);
            x = Math.max(
              20,
              Math.min(windowPosition.x - rect.width / 2, window.innerWidth - rect.width - 20),
            );
            y = Math.max(20, windowPosition.y - rect.height - 20);
          }
        } catch {
          x = window.innerWidth / 2 - rect.width / 2;
          y = window.innerHeight / 2 - rect.height / 2;
        }
      }
    }

    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  }

  private worldToWindow(cartesian: unknown): { x: number; y: number } {
    return { x: 0, y: 0 };
  }
}

declare const Cesium: {
  Cartesian3: {
    fromDegrees: (lon: number, lat: number, alt?: number) => unknown;
  };
};
