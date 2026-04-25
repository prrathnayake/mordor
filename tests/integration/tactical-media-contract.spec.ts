import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(import.meta.dirname, "../..");

async function readPublicAsset(name: string) {
  return await readFile(resolve(repoRoot, "apps/web/public", name), "utf8");
}

describe("Tactical media and info overlay contract", () => {
  it("keeps demo news and webcam layers available when APIs are unavailable", async () => {
    const app = await readPublicAsset("app.js");

    expect(app).toContain("const demoNewsClusters = [");
    expect(app).toContain("const demoWebcamChannels = [");
    expect(app).toMatch(/if \(!response\.ok\) {\s*applyDemoNewsIntelligence\(\);/);
    expect(app).toMatch(
      /catch \(error\) {\s*console\.error\("Failed to load news intelligence:"[\s\S]*applyDemoNewsIntelligence\(\);/,
    );
    expect(app).toMatch(/if \(!response\.ok\) {\s*applyDemoWebcamChannels\(\);/);
    expect(app).toMatch(
      /catch \(error\) {\s*console\.error\("Failed to load webcam channels:"[\s\S]*applyDemoWebcamChannels\(\);/,
    );
    expect(app).toMatch(/loadWebcamChannels\(\);\s*smartPollHandles\.set\(\s*"webcams"/);
  });

  it("renders webcam cards as safe embeds with a click target for location popups", async () => {
    const app = await readPublicAsset("app.js");
    const css = await readPublicAsset("tactical-styles.css");

    expect(app).toContain("function isEmbeddableYouTubeId(videoId)");
    expect(app).toContain("encodeURIComponent(videoId)");
    expect(app).toContain('class="webcam-channel-open"');
    expect(app).toContain("Open location popup");
    expect(app).toContain("showWebcamDetail(channelId)");
    expect(css).toContain(".webcam-placeholder-frame");
    expect(css).toMatch(
      /\.webcam-channel-open\s*{[\s\S]*position: absolute;[\s\S]*inset: 0;[\s\S]*z-index: 2;/,
    );
  });

  it("anchors sanitized DOM earth popups to Cesium-projected media locations", async () => {
    const app = await readPublicAsset("app.js");
    const css = await readPublicAsset("tactical-styles.css");

    expect(app).toContain("function sanitizeExternalHref(value)");
    expect(app).toContain('dataset.testid = "earth-popup-overlay"');
    expect(app).toContain('rel="noopener noreferrer"');
    expect(app).toContain("Cesium.SceneTransforms.wgs84ToWindowCoordinates");
    expect(app).toContain("Math.min(Math.max(x, 150)");
    expect(app).toContain("sanitizeEmbedUrl");
    expect(app).toContain('class="earth-popup-media"');
    expect(app).toContain('updateStatus("NEWS LOCATION POPUP")');
    expect(app).toContain('updateStatus("TV LOCATION POPUP")');
    expect(css).toContain(".earth-popup-overlay");
    expect(css).toContain(".earth-popup-box");
    expect(css).toContain("max-width: min(340px, calc(100vw - 32px))");
    expect(css).toContain(".earth-popup-media iframe");
  });

  it("exposes global intelligence source layers and embedded source watching", async () => {
    const app = await readPublicAsset("app.js");
    const html = await readPublicAsset("index.html");
    const css = await readPublicAsset("tactical-styles.css");

    expect(html).toContain('data-layer="intelSources"');
    expect(html).toContain('id="layer-intel-sources" checked');
    expect(app).toContain("loadIntelligenceSources");
    expect(app).toContain("/intelligence/sources");
    expect(app).toContain("showIntelligenceSourceDetail");
    expect(app).toContain("official-live-watchwall");
    expect(css).toContain(".intel-source-overview");
  });

  it("keeps tactical side rails reachable on narrow viewports", async () => {
    const css = await readPublicAsset("tactical-styles.css");

    expect(css).toMatch(
      /@media \(max-width: 900px\)[\s\S]*\.left-rail,\s*\.right-rail\s*{[\s\S]*position: relative;[\s\S]*width: 100%;[\s\S]*max-height: 42vh;[\s\S]*transform: none;/,
    );
  });
});
