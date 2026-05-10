import { BaseWidget, type BaseWidgetConfig, type Position } from "./base-widget.js";

export interface RoutePoint {
  position: Position;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface RouteLineData {
  points: RoutePoint[];
  color?: string;
  width?: number;
  dashed?: boolean;
  animated?: boolean;
  label?: string;
}

export interface RouteConfig extends BaseWidgetConfig {
  data: RouteLineData;
  cesiumViewer?: unknown;
}

export class RouteLineWidget extends BaseWidget {
  private data: RouteLineData;
  private cesiumViewer: unknown;
  private entity: unknown = null;
  private labelEntity: unknown = null;

  constructor(config: RouteConfig) {
    super(config);
    this.data = config.data;
    this.cesiumViewer = config.cesiumViewer;
  }

  override render(): HTMLElement {
    const container = document.createElement("div");
    container.className = "widget-route-line";
    container.style.cssText = `
      position: absolute;
      pointer-events: none;
      z-index: ${this.zIndex};
    `;

    if (this.cesiumViewer) {
      this.createCesiumPolyline();
    }

    this.element = container;
    return container;
  }

  override update(data: RouteLineData): void {
    this.data = data;
    if (this.entity && this.cesiumViewer) {
      this.updateCesiumPolyline();
    }
  }

  addPoint(point: RoutePoint): void {
    this.data.points.push(point);
    this.update(this.data);
  }

  clearPoints(): void {
    this.data.points = [];
    this.update(this.data);
  }

  private createCesiumPolyline(): void {
    const viewer = this.cesiumViewer as {
      entities: {
        add: (spec: unknown) => unknown;
        remove: (entity: unknown) => void;
      };
    };

    if (!viewer || !this.data.points.length) return;

    const positions = this.data.points.map((p) =>
      Cesium.Cartesian3.fromDegrees(p.position.lon, p.position.lat, p.position.alt ?? 0),
    );

    const colorStr = this.data.color || "#00ff41";
    const color = Cesium.Color.fromCssColorString(colorStr) as {
      withAlpha(alpha: number): unknown;
    };

    const spec = {
      polyline: {
        positions: positions,
        width: this.data.width ?? 2,
        material: this.data.dashed
          ? new Cesium.PolylineDashMaterialProperty({
              color: color,
              dashLength: 16,
            })
          : color.withAlpha(0.8),
        arcType: Cesium.ArcType.GREAT_CIRCLE,
      },
    };

    this.entity = viewer.entities.add(spec);

    if (this.data.label && this.data.points.length > 0) {
      const firstPoint = this.data.points[0];
      this.labelEntity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(
          firstPoint.position.lon,
          firstPoint.position.lat,
          firstPoint.position.alt ?? 0,
        ),
        label: {
          text: this.data.label,
          font: "11px monospace",
          fillColor: color,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(10, -10),
          show: true,
        },
      });
    }
  }

  private updateCesiumPolyline(): void {
    const viewer = this.cesiumViewer as {
      entities: {
        add: (spec: unknown) => unknown;
        remove: (entity: unknown) => void;
      };
    };

    if (!viewer) return;

    if (this.entity) {
      viewer.entities.remove(this.entity as never);
    }
    if (this.labelEntity) {
      viewer.entities.remove(this.labelEntity as never);
    }

    this.entity = null;
    this.labelEntity = null;

    if (this.data.points.length > 0) {
      this.createCesiumPolyline();
    }
  }

  destroy(): void {
    if (this.entity && this.cesiumViewer) {
      const viewer = this.cesiumViewer as {
        entities: { remove: (entity: unknown) => void };
      };
      viewer.entities.remove(this.entity as never);
    }
    if (this.labelEntity && this.cesiumViewer) {
      const viewer = this.cesiumViewer as {
        entities: { remove: (entity: unknown) => void };
      };
      viewer.entities.remove(this.labelEntity as never);
    }
    super.destroy();
  }
}
