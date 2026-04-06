import { readFile } from "node:fs/promises";
import { createServer, type Server, type ServerResponse } from "node:http";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";

interface RunningWebServer {
  readonly server: Server;
  close(): Promise<void>;
}

async function serveStaticFile(
  response: ServerResponse,
  fileUrl: URL,
  contentType: string,
): Promise<void> {
  const content = await readFile(fileUrl);
  response.statusCode = 200;
  response.setHeader("Content-Type", contentType);
  response.end(content);
}

export function createWebServer(options: { api_base_url: string }): RunningWebServer {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const publicRoot = new URL("../public/", import.meta.url);

    try {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const template = await readFile(new URL("index.html", publicRoot), "utf8");
        const html = template.replaceAll("__API_BASE_URL__", options.api_base_url);
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(html);
        return;
      }

      if (url.pathname === "/app.js") {
        await serveStaticFile(
          response,
          new URL("app.js", publicRoot),
          "application/javascript; charset=utf-8",
        );
        return;
      }

      if (url.pathname === "/styles.css") {
        await serveStaticFile(
          response,
          new URL("styles.css", publicRoot),
          "text/css; charset=utf-8",
        );
        return;
      }

      if (url.pathname === "/tactical-styles.css") {
        await serveStaticFile(
          response,
          new URL("tactical-styles.css", publicRoot),
          "text/css; charset=utf-8",
        );
        return;
      }

      response.statusCode = 404;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.end(`Not found: ${extname(url.pathname)}`);
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
}): Promise<RunningWebServer & { port: number }> {
  const runningServer = createWebServer(options);

  await new Promise<void>((resolve, reject) => {
    runningServer.server.once("error", reject);
    runningServer.server.listen(options.port ?? 0, "127.0.0.1", () => resolve());
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
  const apiBaseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3001";
  const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 3000;

  startWebServer({ api_base_url: apiBaseUrl, port }).then(({ port: boundPort }) => {
    console.log(`Web server listening on http://127.0.0.1:${boundPort}`);
  });
}
