export interface PulseOptions {
  duration: number;
  scale?: number;
  opacity?: number;
  color?: string;
}

const DEFAULT_PULSE_OPTIONS: PulseOptions = {
  duration: 1500,
  scale: 1.15,
  opacity: 0.7,
  color: "var(--accent-primary, #00ff41)",
};

export function pulseElement(element: HTMLElement, options?: Partial<PulseOptions>): void {
  const opts = { ...DEFAULT_PULSE_OPTIONS, ...options };

  element.style.animation = `pulseElement ${opts.duration}ms ease-in-out infinite`;
  element.style.setProperty("--pulse-scale", String(opts.scale ?? 1.15));
  element.style.setProperty("--pulse-opacity", String(opts.opacity ?? 0.7));
  element.style.setProperty("--pulse-color", opts.color || "var(--accent-primary)");
}

export function stopPulse(element: HTMLElement): void {
  element.style.animation = "";
  element.style.setProperty("--pulse-scale", "");
  element.style.setProperty("--pulse-opacity", "");
  element.style.setProperty("--pulse-color", "");
}

export function pulseOnce(element: HTMLElement, options?: Partial<PulseOptions>): Promise<void> {
  const opts = { ...DEFAULT_PULSE_OPTIONS, ...options };

  return new Promise((resolve) => {
    element.style.transition = `transform ${opts.duration}ms ease-out, opacity ${opts.duration}ms ease-out`;
    element.style.transform = `scale(${opts.scale})`;
    element.style.opacity = String(opts.opacity);

    setTimeout(() => {
      element.style.transform = "scale(1)";
      element.style.opacity = "1";
      element.style.transition = "";
      resolve();
    }, opts.duration);
  });
}

export function rippleEffect(element: HTMLElement, options?: Partial<PulseOptions>): Promise<void> {
  const opts = { ...DEFAULT_PULSE_OPTIONS, ...options };

  return new Promise((resolve) => {
    const ripple = document.createElement("div");
    ripple.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background: ${opts.color || "var(--accent-primary)"};
      opacity: 0.5;
      transform: translate(-50%, -50%) scale(0);
      pointer-events: none;
    `;

    element.style.position = "relative";
    element.style.overflow = "hidden";
    element.appendChild(ripple);

    requestAnimationFrame(() => {
      ripple.style.transition = `transform ${opts.duration}ms ease-out, opacity ${opts.duration}ms ease-out`;
      ripple.style.transform = "translate(-50%, -50%) scale(2)";
      ripple.style.opacity = "0";
    });

    setTimeout(() => {
      ripple.remove();
      resolve();
    }, opts.duration);
  });
}

export class LiveIndicator {
  private element: HTMLElement;
  private intervalId?: ReturnType<typeof setInterval>;
  private on: boolean = false;

  constructor(element: HTMLElement) {
    this.element = element;
    this.element.classList.add("live-indicator");
  }

  start(): void {
    if (this.on) return;
    this.on = true;
    this.element.classList.add("live-active");

    this.intervalId = setInterval(() => {
      this.element.classList.toggle("live-pulse");
      setTimeout(() => {
        this.element.classList.toggle("live-pulse");
      }, 500);
    }, 2000);
  }

  stop(): void {
    if (!this.on) return;
    this.on = false;
    this.element.classList.remove("live-active", "live-pulse");

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  toggle(): void {
    if (this.on) {
      this.stop();
    } else {
      this.start();
    }
  }
}
