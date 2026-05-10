import { getZoomBehavior, type ZoomLevelBehavior } from "../animations/zoom-animations.js";
import type { BaseWidget, Position } from "../widgets/base-widget.js";
import { type CategoryIcon, WidgetFactory } from "../widgets/widget-factory.js";

// Cesium global is defined in cesium.d.ts

export interface CesiumWidgetConfig {
  layerId: string;
  item: Record<string, unknown>;
  position: Position;
  zoomLevel: number;
  showTooltip?: boolean;
  showLabel?: boolean;
  showInfoCard?: boolean;
}

export interface CesiumWidgetLayerConfig {
  layerId: string;
  color: string;
  outlineColor: string;
  cesiumViewer: unknown;
}

export class CesiumWidgetLayer {
  private layerId: string;
  private color: string;
  private outlineColor: string;
  private cesiumViewer: unknown;
  private widgets: Map<string, BaseWidget> = new Map();
  private currentZoom: number = 5;

  constructor(config: CesiumWidgetLayerConfig) {
    this.layerId = config.layerId;
    this.color = config.color;
    this.outlineColor = config.outlineColor;
    this.cesiumViewer = config.cesiumViewer;
  }

  getLayerId(): string {
    return this.layerId;
  }

  addWidget(id: string, widget: BaseWidget): void {
    this.widgets.set(id, widget);
  }

  removeWidget(id: string): void {
    const widget = this.widgets.get(id);
    if (widget) {
      widget.destroy();
      this.widgets.delete(id);
    }
  }

  getWidget(id: string): BaseWidget | undefined {
    return this.widgets.get(id);
  }

  clearWidgets(): void {
    this.widgets.forEach((widget) => widget.destroy());
    this.widgets.clear();
  }

  setZoomLevel(zoom: number): void {
    const oldZoom = this.currentZoom;
    this.currentZoom = zoom;

    const behavior = getZoomBehavior(zoom);
    this.applyZoomBehavior(behavior, zoom, oldZoom);
  }

  private applyZoomBehavior(behavior: ZoomLevelBehavior, newZoom: number, oldZoom: number): void {
    this.widgets.forEach((widget) => {
      if (behavior.showLabels) {
        widget.show();
      } else {
        widget.hide();
      }
    });
  }

  renderItem(config: CesiumWidgetConfig): BaseWidget | null {
    const categoryInfo = WidgetFactory.getCategoryIcon(this.layerId);
    const widgetColor = (config.item.color as string) || categoryInfo.color;

    if (this.currentZoom <= 4 && this.widgets.size > 50) {
      return null;
    }

    const id = `widget-${config.item.id || Math.random().toString(36).slice(2, 8)}`;
    const behavior = getZoomBehavior(this.currentZoom);

    if (behavior.showLabels) {
      const labelText = this.getLabelForBehavior(config.item, behavior.labelStyle);
      const isCritical =
        (config.item.severity as string) === "critical" ||
        (config.item.severity as string) === "high";

      const pointSize = isCritical ? 12 : this.layerId === "aviation" ? 10 : 8;

      this.addCesiumEntity(id, {
        position: config.position,
        point: {
          pixelSize: pointSize,
          color: Cesium.Color.fromCssColorString(widgetColor),
          outlineColor: isCritical
            ? Cesium.Color.fromCssColorString("#ff3333")
            : Cesium.Color.fromCssColorString(this.outlineColor),
          outlineWidth: isCritical ? 3 : 1.5,
          heightReference: Cesium.HeightReference.NONE,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000000),
        },
        label: {
          text: labelText,
          font: "11px monospace",
          fillColor: Cesium.Color.fromCssColorString(widgetColor),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -14),
          heightReference: Cesium.HeightReference.NONE,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2000000),
          show: behavior.showLabels,
        },
        description: this.buildDescription(config.item),
      });
    }

    if (config.showTooltip || config.showInfoCard) {
      const tooltipWidget = WidgetFactory.createLayerMarker(
        this.layerId,
        config.item,
        config.position,
      );

      if (config.showInfoCard) {
        const cardWidget = WidgetFactory.createItemInfoCard(
          this.layerId,
          config.item,
          config.position,
        );
        this.addWidget(id + "-card", cardWidget);
      }

      this.addWidget(id + "-tooltip", tooltipWidget);
    }

    return this.widgets.get(id) ?? null;
  }

  private addCesiumEntity(
    id: string,
    spec: {
      position: Position;
      point: Record<string, unknown>;
      label: Record<string, unknown>;
      description: string;
    },
  ): void {
    const viewer = this.cesiumViewer as {
      entities: {
        add: (spec: unknown) => { id: string };
        remove: (entity: unknown) => boolean;
      };
    };

    if (!viewer) return;

    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(
        spec.position.lon,
        spec.position.lat,
        spec.position.alt ?? 0,
      ),
      point: spec.point,
      label: spec.label,
      description: spec.description,
    });

    this.widgets.set(id, {
      id,
      layerId: this.layerId,
      position: spec.position,
      visible: true,
      zIndex: 0,
      render: () => document.createElement("div"),
      update: () => {},
      show: () => {},
      hide: () => {},
      destroy: () => {
        viewer.entities.remove(entity);
      },
    } as unknown as BaseWidget);
  }

  private getLabelForBehavior(
    item: Record<string, unknown>,
    style: "none" | "abbreviated" | "full",
  ): string {
    let label = "";

    switch (this.layerId) {
      case "aviation":
        label = (item.callsign as string) || (item.icao24 as string) || "";
        break;
      case "weather":
        label = item.temperature_c != null ? `${item.temperature_c}°C` : "";
        break;
      case "security":
        label = (item.ip_address as string) || (item.domain as string) || "";
        break;
      case "space":
        label = (item.title as string)?.slice(0, 25) || "";
        break;
      default:
        label = (item.name as string) || "";
    }

    if (style === "abbreviated") {
      return label.length > 10 ? `${label.slice(0, 8)}…` : label;
    }
    if (style === "none") {
      return "";
    }

    return label;
  }

  private buildDescription(item: Record<string, unknown>): string {
    const rows: string[] = [];
    for (const [k, v] of Object.entries(item)) {
      if (v == null || k === "metadata" || k === "payload") continue;
      const escaped = String(v).replace(/</g, "&lt;").replace(/>/g, "&gt;");
      rows.push(
        `<tr><td style="color:#6b7280;padding-right:8px">${k}</td><td>${escaped.slice(0, 100)}</td></tr>`,
      );
    }
    return `<table style="font:11px monospace">${rows.join("")}</table>`;
  }
}

export function createWidgetLayer(
  layerId: string,
  cesiumViewer: unknown,
  color: string,
  outlineColor: string,
): CesiumWidgetLayer {
  return new CesiumWidgetLayer({
    layerId,
    color,
    outlineColor,
    cesiumViewer,
  });
}
