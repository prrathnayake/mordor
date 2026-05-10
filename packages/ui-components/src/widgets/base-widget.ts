export interface Position {
  lat: number;
  lon: number;
  alt?: number;
}

export interface BaseWidgetConfig {
  id: string;
  layerId: string;
  position: Position;
  visible?: boolean;
  zIndex?: number;
}

export abstract class BaseWidget {
  id: string;
  layerId: string;
  position: Position;
  visible: boolean = true;
  zIndex: number = 0;
  element: HTMLElement | null = null;

  constructor(config: BaseWidgetConfig) {
    this.id = config.id;
    this.layerId = config.layerId;
    this.position = config.position;
    this.visible = config.visible ?? true;
    this.zIndex = config.zIndex ?? 0;
  }

  abstract render(): HTMLElement;
  abstract update(data: unknown): void;

  show(): void {
    this.visible = true;
    if (this.element) {
      this.element.style.display = "";
    }
  }

  hide(): void {
    this.visible = false;
    if (this.element) {
      this.element.style.display = "none";
    }
  }

  destroy(): void {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.element = null;
  }

  setPosition(position: Position): void {
    this.position = position;
  }

  setZIndex(zIndex: number): void {
    this.zIndex = zIndex;
    if (this.element) {
      this.element.style.zIndex = String(zIndex);
    }
  }
}
