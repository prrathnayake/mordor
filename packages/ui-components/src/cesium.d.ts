/**
 * Cesium Type Declarations
 *
 * Stub type declarations for the Cesium global object used in browser context.
 */

declare global {
  const Cesium: {
    Cartesian3: {
      fromDegrees(lon: number, lat: number, alt?: number): unknown;
    };
    Cartesian2: new (x: number, y: number) => unknown;
    Color: {
      fromCssColorString(color: string): unknown;
      BLACK: unknown;
      RED: unknown;
      withAlpha(alpha: number): unknown;
    };
    LabelStyle: {
      FILL_AND_OUTLINE: number;
      FILL: number;
      OUTLINE: number;
    };
    HeightReference: {
      NONE: number;
      CLAMP_TO_GROUND: number;
    };
    DistanceDisplayCondition: new (min: number, max: number) => unknown;
    ScreenSpaceEventHandler: new (
      element: HTMLCanvasElement,
    ) => {
      setInputAction(callback: (event: unknown) => void, type: number): void;
      destroy(): void;
    };
    ScreenSpaceEventType: {
      LEFT_CLICK: number;
      MOUSE_MOVE: number;
    };
    SceneMode: {
      SCENE3D: number;
    };
    Math: {
      toDegrees(radians: number): number;
    };
    defined(value: unknown): boolean;
    JulianDate: {
      now(): unknown;
    };
    Cartographic: {
      fromCartesian(cartesian: unknown): {
        latitude: number;
        longitude: number;
        height: number;
      };
    };
    Viewer: new (
      container: string | HTMLElement,
      options?: Record<string, unknown>,
    ) => {
      entities: {
        add(spec: unknown): { id: string };
        remove(entity: unknown): boolean;
        removeAll(): void;
      };
      scene: {
        canvas: HTMLCanvasElement;
        pick(position: unknown): { id?: { properties?: unknown } } | undefined;
        globe: { ellipsoid: unknown };
        clustering: {
          enabled: boolean;
          clusterEvent: {
            addEventListener(
              callback: (clusteredEntities: unknown[], cluster: unknown) => void,
            ): void;
          };
        };
      };
      camera: {
        positionCartographic: {
          latitude: number;
          longitude: number;
          height: number;
        };
        setView(options: { destination: unknown }): void;
        flyTo(options: { destination: unknown; duration?: number }): void;
        changed: {
          addEventListener(callback: () => void): void;
        };
      };
      imageryLayers: {
        addImageryProvider(provider: unknown): void;
      };
    };
    ImageryLayer: {
      fromProviderAsync(provider: unknown): Promise<unknown>;
    };
    GeoJsonDataSource: {
      load(data: unknown, options?: unknown): Promise<unknown>;
    };
    Entity: new () => unknown;
    PolygonHierarchy: new (positions: unknown[]) => unknown;
    PolylineGraphics: new (options?: unknown) => unknown;
    PointGraphics: new (options?: unknown) => unknown;
    BillboardGraphics: new (options?: unknown) => unknown;
    LabelGraphics: new (options?: unknown) => unknown;
    EllipseGraphics: new (options?: unknown) => unknown;
    PolylineDashMaterialProperty: new (props: { color: unknown; dashLength: number }) => unknown;
    ArcType: {
      GREAT_CIRCLE: number;
    };
  };
}

export {};
