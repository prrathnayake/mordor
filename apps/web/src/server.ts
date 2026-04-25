import { readFile } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface RunningWebServer {
  readonly server: Server;
  close(): Promise<void>;
}

interface MapImageryConfig {
  provider: string;
  url: string | null;
  credit: string | null;
  maxLevel: number | null;
}

interface StreetSceneConfig {
  provider: string;
  ionToken: string | null;
  googleApiKey: string | null;
}

interface WebAppConfig {
  apiBaseUrl: string;
  mapImagery: MapImageryConfig;
  streetScene: StreetSceneConfig;
}

async function serveStaticFile(
  response: ServerResponse,
  fileUrl: URL,
  contentType: string,
  cacheControl = "public, max-age=3600",
): Promise<void> {
  const content = await readFile(fileUrl);
  response.statusCode = 200;
  response.setHeader("Content-Type", contentType);
  response.setHeader("Cache-Control", cacheControl);
  response.end(content);
}

function getContentType(pathname: string): string {
  switch (extname(pathname)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".wasm":
      return "application/wasm";
    case ".xml":
      return "application/xml; charset=utf-8";
    case ".glsl":
      return "text/plain; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function normalizeMapImageryConfig(mapImagery?: Partial<MapImageryConfig>): MapImageryConfig {
  return {
    provider: mapImagery?.provider?.trim() || "arcgis-world-imagery",
    url: mapImagery?.url?.trim() || null,
    credit: mapImagery?.credit?.trim() || null,
    maxLevel:
      typeof mapImagery?.maxLevel === "number" && Number.isFinite(mapImagery.maxLevel)
        ? mapImagery.maxLevel
        : null,
  };
}

function normalizeStreetSceneConfig(streetScene?: Partial<StreetSceneConfig>): StreetSceneConfig {
  return {
    provider: streetScene?.provider?.trim() || "none",
    ionToken: streetScene?.ionToken?.trim() || null,
    googleApiKey: streetScene?.googleApiKey?.trim() || null,
  };
}

function addCorsHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "content-type,authorization,x-client-session-id",
  );
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,PATCH,DELETE");
  response.setHeader("Access-Control-Max-Age", "86400");
}

export function createWebServer(options: { app_config: WebAppConfig }): RunningWebServer {
  const server = createServer(async (request, response) => {
    addCorsHeaders(response);

    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }

    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const isProduction = process.env.NODE_ENV === "production";
    const publicRoot = isProduction
      ? new URL("file:///app/apps/web/public/")
      : new URL("../public/", import.meta.url);
    const cesiumRoot = new URL("../../../node_modules/cesium/Build/Cesium/", import.meta.url);

    try {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const template = await readFile(new URL("index.html", publicRoot), "utf8");
        const html = template.replaceAll("__APP_CONFIG_JSON__", JSON.stringify(options.app_config));
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.end(html);
        return;
      }

      if (url.pathname.startsWith("/cesium/")) {
        const relativePath = url.pathname.replace("/cesium/", "");
        const resolvedPath = resolve(cesiumRoot.pathname, relativePath);
        const resolvedRoot = resolve(cesiumRoot.pathname);

        if (!resolvedPath.startsWith(resolvedRoot)) {
          response.statusCode = 400;
          response.setHeader("Content-Type", "text/plain; charset=utf-8");
          response.end("Invalid asset path");
          return;
        }

        await serveStaticFile(
          response,
          new URL(relativePath, cesiumRoot),
          getContentType(relativePath),
        );
        return;
      }

      if (url.pathname === "/app.js") {
        await serveStaticFile(
          response,
          new URL("app.js", publicRoot),
          getContentType("app.js"),
          "no-store",
        );
        return;
      }

      if (url.pathname === "/styles.css") {
        await serveStaticFile(
          response,
          new URL("styles.css", publicRoot),
          getContentType("styles.css"),
          "no-store",
        );
        return;
      }

      if (url.pathname === "/tactical-styles.css") {
        await serveStaticFile(
          response,
          new URL("tactical-styles.css", publicRoot),
          getContentType("tactical-styles.css"),
          "no-store",
        );
        return;
      }

      if (url.pathname === "/dashboard.js") {
        await serveStaticFile(
          response,
          new URL("dashboard.js", publicRoot),
          getContentType("dashboard.js"),
          "no-store",
        );
        return;
      }

      if (url.pathname === "/dashboard-styles.css") {
        await serveStaticFile(
          response,
          new URL("dashboard-styles.css", publicRoot),
          getContentType("dashboard-styles.css"),
          "no-store",
        );
        return;
      }

      response.statusCode = 404;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.end(`Not found: ${url.pathname}`);
    } catch (error) {
      response.statusCode = 500;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.end(error instanceof Error ? error.message : "Web server failure");
    }
  });

  return {
    server,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}

export async function startWebServer(options: {
  api_base_url: string;
  port?: number;
  map_imagery?: Partial<MapImageryConfig>;
  street_scene?: Partial<StreetSceneConfig>;
}): Promise<RunningWebServer & { port: number }> {
  const runningServer = createWebServer({
    app_config: {
      apiBaseUrl: options.api_base_url,
      mapImagery: normalizeMapImageryConfig(options.map_imagery),
      streetScene: normalizeStreetSceneConfig(options.street_scene),
    },
  });

  await new Promise<void>((resolve, reject) => {
    runningServer.server.once("error", reject);
    runningServer.server.listen(options.port ?? 0, "0.0.0.0", () => resolve());
  });

  const address = runningServer.server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to determine web server address");
  }

  return {
    ...runningServer,
    port: address.port,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const apiPort = process.env.API_PORT ? Number.parseInt(process.env.API_PORT, 10) : 3000;
  const apiBaseUrl = process.env.API_BASE_URL ?? `http://127.0.0.1:${apiPort}`;
  const mapImageryMaxLevel = process.env.MAP_IMAGERY_MAX_LEVEL
    ? Number.parseInt(process.env.MAP_IMAGERY_MAX_LEVEL, 10)
    : undefined;
  const port = process.env.WEB_PORT
    ? Number.parseInt(process.env.WEB_PORT, 10)
    : process.env.PORT
      ? Number.parseInt(process.env.PORT, 10)
      : 3001;

  startWebServer({
    api_base_url: apiBaseUrl,
    port,
    map_imagery: {
      provider: process.env.MAP_IMAGERY_PROVIDER,
      url: process.env.MAP_IMAGERY_URL,
      credit: process.env.MAP_IMAGERY_CREDIT,
      maxLevel: Number.isFinite(mapImageryMaxLevel) ? mapImageryMaxLevel : undefined,
    },
    street_scene: {
      provider: process.env.STREET_SCENE_PROVIDER,
      ionToken: process.env.CESIUM_ION_TOKEN,
      googleApiKey: process.env.GOOGLE_MAPS_API_KEY,
    },
  }).then(({ port: boundPort }) => {
    console.log(`Web server listening on http://0.0.0.0:${boundPort}`);
  });
}
