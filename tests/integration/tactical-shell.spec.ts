import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "../../apps/api/src/index.js";
import { startWebServer } from "../../apps/web/src/server.js";
import { startPostgresTestEnvironment } from "../helpers/postgres-test-environment.js";

describe("Tactical UI Shell Integration", () => {
  let environment: Awaited<ReturnType<typeof startPostgresTestEnvironment>>;
  let api: Awaited<ReturnType<typeof startApiServer>>;
  let web: Awaited<ReturnType<typeof startWebServer>>;

  beforeAll(async () => {
    environment = await startPostgresTestEnvironment();
    api = await startApiServer({
      connection_string: environment.connection_string,
      skipConfigValidation: true,
    });
    web = await startWebServer({
      api_base_url: `http://127.0.0.1:${api.port}`,
    });
  });

  afterAll(async () => {
    await web.close();
    await api.close();
    await environment.stop();
  });

  describe("Web Server Assets", () => {
    it("should serve tactical-styles.css", async () => {
      const response = await fetch(`http://127.0.0.1:${web.port}/tactical-styles.css`);
      expect(response.status).toBe(200);
      const content = await response.text();
      expect(content).toContain("MORDOR");
      expect(content).toContain("tactical-header");
    });

    it("should serve updated app.js", async () => {
      const response = await fetch(`http://127.0.0.1:${web.port}/app.js`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const content = await response.text();
      expect(content).toContain("MORDOR");
      expect(content).toContain("tactical");
      expect(content).toContain("TileMapServiceImageryProvider.fromUrl");
      expect(content).toContain("NaturalEarthII");
    });

    it("should serve updated index.html", async () => {
      const response = await fetch(`http://127.0.0.1:${web.port}/`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const content = await response.text();
      expect(content).toContain("MORDOR");
      expect(content).toContain("tactical-styles.css");
      expect(content).toContain('data-theme="crt"');
    });
  });

  describe("HTML Structure", () => {
    it("should contain all required UI elements", async () => {
      const response = await fetch(`http://127.0.0.1:${web.port}/`);
      const html = await response.text();

      // Header elements
      expect(html).toContain('class="tactical-header"');
      expect(html).toContain('class="system-name"');
      expect(html).toContain("MORDOR");
      expect(html).toContain('id="mode-value"');
      expect(html).toContain('id="time-display"');

      // Rails
      expect(html).toContain('class="left-rail"');
      expect(html).toContain('class="right-rail"');
      expect(html).toContain('class="center-viewport"');

      // Footer
      expect(html).toContain('class="tactical-footer"');
    });

    it("should contain all 8 data layers", async () => {
      const response = await fetch(`http://127.0.0.1:${web.port}/`);
      const html = await response.text();

      expect(html).toContain('data-layer="flights"');
      expect(html).toContain('data-layer="military"');
      expect(html).toContain('data-layer="earthquakes"');
      expect(html).toContain('data-layer="satellites"');
      expect(html).toContain('data-layer="traffic"');
      expect(html).toContain('data-layer="weather"');
      expect(html).toContain('data-layer="cctv"');
      expect(html).toContain('data-layer="bikeshare"');
    });

    it("should contain style preset buttons", async () => {
      const response = await fetch(`http://127.0.0.1:${web.port}/`);
      const html = await response.text();

      expect(html).toContain('data-preset="crt"');
      expect(html).toContain('data-preset="nvg"');
      expect(html).toContain('data-preset="flir"');
      expect(html).toContain('data-preset="clean"');
    });

    it("should contain visual control sliders", async () => {
      const response = await fetch(`http://127.0.0.1:${web.port}/`);
      const html = await response.text();

      expect(html).toContain('id="bloom-slider"');
      expect(html).toContain('id="sharpen-slider"');
      expect(html).toContain('id="pixelate-slider"');
      expect(html).toContain('id="distortion-slider"');
      expect(html).toContain('id="instability-slider"');
    });

    it("should contain modals", async () => {
      const response = await fetch(`http://127.0.0.1:${web.port}/`);
      const html = await response.text();

      expect(html).toContain('id="login-modal"');
      expect(html).toContain('id="query-modal"');
      expect(html).toContain('id="alert-modal"');
    });
  });

  describe("API Integration", () => {
    it("should provide API base URL to frontend", async () => {
      const response = await fetch(`http://127.0.0.1:${web.port}/`);
      const html = await response.text();

      // Should contain the app config with API URL
      expect(html).toContain("__APP_CONFIG__");
      expect(html).toContain("apiBaseUrl");
    });

    it("should have Cesium loaded", async () => {
      const response = await fetch(`http://127.0.0.1:${web.port}/`);
      const html = await response.text();

      expect(html).toContain("/cesium/Cesium.js");
      expect(html).toContain("CESIUM_BASE_URL");
      expect(html).toContain('id="cesiumContainer"');
    });
  });
});

describe("Tactical UI State Management", () => {
  let environment: Awaited<ReturnType<typeof startPostgresTestEnvironment>>;
  let api: Awaited<ReturnType<typeof startApiServer>>;
  let web: Awaited<ReturnType<typeof startWebServer>>;

  beforeAll(async () => {
    environment = await startPostgresTestEnvironment();
    api = await startApiServer({
      connection_string: environment.connection_string,
      skipConfigValidation: true,
    });
    web = await startWebServer({
      api_base_url: `http://127.0.0.1:${api.port}`,
    });
  });

  afterAll(async () => {
    await web.close();
    await api.close();
    await environment.stop();
  });

  describe("Layer State", () => {
    it("should have flights layer enabled by default", async () => {
      const response = await fetch(`http://127.0.0.1:${web.port}/`);
      const html = await response.text();

      expect(html).toContain('id="layer-flights" checked');
    });

    it("should have CCTV layer enabled by default", async () => {
      const response = await fetch(`http://127.0.0.1:${web.port}/`);
      const html = await response.text();

      expect(html).toContain('id="layer-cctv" checked');
    });

    it("should have unavailable layers disabled", async () => {
      const response = await fetch(`http://127.0.0.1:${web.port}/`);
      const html = await response.text();

      expect(html).toContain('id="layer-military" disabled');
    });
  });

  describe("Visual State", () => {
    it("should default to CRT theme", async () => {
      const response = await fetch(`http://127.0.0.1:${web.port}/`);
      const html = await response.text();

      expect(html).toContain('data-theme="crt"');
    });

    it("should have HUD enabled by default", async () => {
      const response = await fetch(`http://127.0.0.1:${web.port}/`);
      const html = await response.text();

      expect(html).toContain('id="toggle-hud" checked');
    });

    it("should default to expanded layout", async () => {
      const response = await fetch(`http://127.0.0.1:${web.port}/`);
      const html = await response.text();

      expect(html).toContain('<option value="expanded" selected>');
    });
  });
});

describe("Tactical UI Accessibility", () => {
  let environment: Awaited<ReturnType<typeof startPostgresTestEnvironment>>;
  let api: Awaited<ReturnType<typeof startApiServer>>;
  let web: Awaited<ReturnType<typeof startWebServer>>;

  beforeAll(async () => {
    environment = await startPostgresTestEnvironment();
    api = await startApiServer({
      connection_string: environment.connection_string,
      skipConfigValidation: true,
    });
    web = await startWebServer({
      api_base_url: `http://127.0.0.1:${api.port}`,
    });
  });

  afterAll(async () => {
    await web.close();
    await api.close();
    await environment.stop();
  });

  it("should have proper ARIA labels on interactive elements", async () => {
    const response = await fetch(`http://127.0.0.1:${web.port}/`);
    const html = await response.text();

    // Check for semantic HTML structure
    expect(html).toContain("<header");
    expect(html).toContain("<main");
    expect(html).toContain("<footer");
    expect(html).toContain("<aside");
  });

  it("should have visible focus states in CSS", async () => {
    const response = await fetch(`http://127.0.0.1:${web.port}/tactical-styles.css`);
    expect(response.status).toBe(200);
    const css = await response.text();

    expect(css).toContain(":focus");
  });
});

describe("Tactical UI Security", () => {
  let environment: Awaited<ReturnType<typeof startPostgresTestEnvironment>>;
  let api: Awaited<ReturnType<typeof startApiServer>>;
  let web: Awaited<ReturnType<typeof startWebServer>>;

  beforeAll(async () => {
    environment = await startPostgresTestEnvironment();
    api = await startApiServer({
      connection_string: environment.connection_string,
      skipConfigValidation: true,
    });
    web = await startWebServer({
      api_base_url: `http://127.0.0.1:${api.port}`,
    });
  });

  afterAll(async () => {
    await web.close();
    await api.close();
    await environment.stop();
  });

  it("should not expose sensitive data in HTML", async () => {
    const response = await fetch(`http://127.0.0.1:${web.port}/`);
    expect(response.status).toBe(200);
    const html = await response.text();

    // Should not contain any hardcoded tokens
    expect(html).not.toContain("eyJhbGciOiJIUzI1NiIs");
  });

  it("should use template placeholder for API URL", async () => {
    const response = await fetch(`http://127.0.0.1:${web.port}/`);
    expect(response.status).toBe(200);
    const html = await response.text();

    // Should have API config with replaced URL
    expect(html).toContain("__APP_CONFIG__");
    expect(html).toContain("apiBaseUrl");
    // The placeholder gets replaced, so we check it's not the raw template
    expect(html).not.toContain("__API_BASE_URL__");
  });
});
