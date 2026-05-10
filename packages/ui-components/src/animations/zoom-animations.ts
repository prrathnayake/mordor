export interface ZoomLevelBehavior {
  minZoom: number;
  maxZoom: number;
  showClusters: boolean;
  showLabels: boolean;
  labelStyle: "none" | "abbreviated" | "full";
  autoExpandCards: boolean;
  clusterThreshold: number;
}

export const ZOOM_LEVELS: Record<string, ZoomLevelBehavior> = {
  veryLow: {
    minZoom: 1,
    maxZoom: 4,
    showClusters: true,
    showLabels: false,
    labelStyle: "none",
    autoExpandCards: false,
    clusterThreshold: 10,
  },
  low: {
    minZoom: 5,
    maxZoom: 10,
    showClusters: true,
    showLabels: true,
    labelStyle: "abbreviated",
    autoExpandCards: false,
    clusterThreshold: 5,
  },
  medium: {
    minZoom: 11,
    maxZoom: 15,
    showClusters: true,
    showLabels: true,
    labelStyle: "full",
    autoExpandCards: true,
    clusterThreshold: 3,
  },
  high: {
    minZoom: 16,
    maxZoom: 20,
    showClusters: false,
    showLabels: true,
    labelStyle: "full",
    autoExpandCards: true,
    clusterThreshold: 1,
  },
};

export function getZoomBehavior(zoomLevel: number): ZoomLevelBehavior {
  if (zoomLevel <= 4) return ZOOM_LEVELS.veryLow;
  if (zoomLevel <= 10) return ZOOM_LEVELS.low;
  if (zoomLevel <= 15) return ZOOM_LEVELS.medium;
  return ZOOM_LEVELS.high;
}

export function shouldClusterItems(count: number, zoomLevel: number): boolean {
  const behavior = getZoomBehavior(zoomLevel);
  return count >= behavior.clusterThreshold;
}

export function getLabelForZoom(label: string, style: "none" | "abbreviated" | "full"): string {
  switch (style) {
    case "none":
      return "";
    case "abbreviated":
      return label.length > 10 ? `${label.slice(0, 8)}…` : label;
    case "full":
    default:
      return label;
  }
}

export function animateZoomChange(
  element: HTMLElement,
  fromZoom: number,
  toZoom: number,
  duration: number = 300,
): Promise<void> {
  return new Promise((resolve) => {
    element.style.transition = `transform ${duration}ms ease-out, opacity ${duration}ms ease-out`;

    if (toZoom > fromZoom) {
      element.style.transform = "scale(1.1)";
      element.style.opacity = "0.8";
    } else {
      element.style.transform = "scale(0.9)";
      element.style.opacity = "0.6";
    }

    requestAnimationFrame(() => {
      element.style.transform = "scale(1)";
      element.style.opacity = "1";
    });

    setTimeout(() => {
      element.style.transition = "";
      resolve();
    }, duration);
  });
}

export class ZoomAnimationController {
  private currentZoom: number = 5;
  private listeners: Array<(zoom: number, behavior: ZoomLevelBehavior) => void> = [];

  setZoom(zoom: number): void {
    const behavior = getZoomBehavior(zoom);
    if (zoom !== this.currentZoom) {
      this.currentZoom = zoom;
      this.notifyListeners(zoom, behavior);
    }
  }

  getZoom(): number {
    return this.currentZoom;
  }

  getBehavior(): ZoomLevelBehavior {
    return getZoomBehavior(this.currentZoom);
  }

  onZoomChange(callback: (zoom: number, behavior: ZoomLevelBehavior) => void): () => void {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(zoom: number, behavior: ZoomLevelBehavior): void {
    for (const listener of this.listeners) {
      listener(zoom, behavior);
    }
  }
}
