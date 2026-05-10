export type FadeDirection = "in" | "out";
export type FadeEasing = "ease" | "ease-in" | "ease-out" | "ease-in-out" | "linear";

export interface FadeOptions {
  duration: number;
  easing?: FadeEasing;
  delay?: number;
  opacity?: number;
}

const DEFAULT_FADE_OPTIONS: FadeOptions = {
  duration: 200,
  easing: "ease-out",
  delay: 0,
  opacity: 1,
};

export function fadeElement(
  element: HTMLElement,
  direction: FadeDirection,
  options: Partial<FadeOptions> = {},
): Promise<void> {
  const opts = { ...DEFAULT_FADE_OPTIONS, ...options };

  return new Promise((resolve) => {
    element.style.transition = `opacity ${opts.duration}ms ${opts.easing}`;
    if ((opts.delay ?? 0) > 0) {
      element.style.transitionDelay = `${opts.delay}ms`;
    }

    if (direction === "out") {
      element.style.opacity = "0";
    } else {
      element.style.opacity = String(opts.opacity ?? 1);
    }

    setTimeout(
      () => {
        element.style.transition = "";
        element.style.transitionDelay = "";
        resolve();
      },
      opts.duration + (opts.delay ?? 0),
    );
  });
}

export function fadeIn(element: HTMLElement, options?: Partial<FadeOptions>): Promise<void> {
  return fadeElement(element, "in", options);
}

export function fadeOut(element: HTMLElement, options?: Partial<FadeOptions>): Promise<void> {
  return fadeElement(element, "out", options);
}

export function slideElement(
  element: HTMLElement,
  direction: "up" | "down" | "left" | "right",
  options: Partial<FadeOptions> = {},
): Promise<void> {
  const opts = { ...DEFAULT_FADE_OPTIONS, ...options };

  const transforms: Record<string, string> = {
    up: "translateY(20px)",
    down: "translateY(-20px)",
    left: "translateX(20px)",
    right: "translateX(-20px)",
  };

  return new Promise((resolve) => {
    element.style.transition = `opacity ${opts.duration}ms ${opts.easing}, transform ${opts.duration}ms ${opts.easing}`;
    if ((opts.delay ?? 0) > 0) {
      element.style.transitionDelay = `${opts.delay}ms`;
    }

    element.style.opacity = "0";
    element.style.transform = transforms[direction];

    requestAnimationFrame(() => {
      element.style.opacity = String(opts.opacity ?? 1);
      element.style.transform = "translate(0, 0)";
    });

    setTimeout(
      () => {
        element.style.transition = "";
        element.style.transitionDelay = "";
        element.style.transform = "";
        resolve();
      },
      opts.duration + (opts.delay ?? 0),
    );
  });
}

export function slideUp(element: HTMLElement, options?: Partial<FadeOptions>): Promise<void> {
  return slideElement(element, "up", options);
}

export function slideDown(element: HTMLElement, options?: Partial<FadeOptions>): Promise<void> {
  return slideElement(element, "down", options);
}

export class FadeController {
  private elements: Map<HTMLElement, { fadeInOpts: FadeOptions; fadeOutOpts: FadeOptions }> =
    new Map();

  register(
    element: HTMLElement,
    fadeInOpts?: Partial<FadeOptions>,
    fadeOutOpts?: Partial<FadeOptions>,
  ): void {
    this.elements.set(element, {
      fadeInOpts: { ...DEFAULT_FADE_OPTIONS, ...fadeInOpts },
      fadeOutOpts: { ...DEFAULT_FADE_OPTIONS, ...fadeOutOpts },
    });
  }

  unregister(element: HTMLElement): void {
    this.elements.delete(element);
  }

  async fadeIn(element: HTMLElement): Promise<void> {
    const config = this.elements.get(element);
    const opts = config?.fadeInOpts ?? DEFAULT_FADE_OPTIONS;
    return fadeIn(element, opts);
  }

  async fadeOut(element: HTMLElement): Promise<void> {
    const config = this.elements.get(element);
    const opts = config?.fadeOutOpts ?? DEFAULT_FADE_OPTIONS;
    return fadeOut(element, opts);
  }

  async transitionIn(elements: HTMLElement[], staggerDelay: number = 50): Promise<void> {
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      await fadeIn(el, { delay: i * staggerDelay });
    }
  }

  async transitionOut(elements: HTMLElement[], staggerDelay: number = 30): Promise<void> {
    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      await fadeOut(el, { delay: i * staggerDelay });
    }
  }
}
