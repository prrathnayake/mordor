import { expect, test } from "@playwright/test";
import { startWebServer } from "../../apps/web/src/server.js";

test.describe.configure({ mode: "serial" });

let web: Awaited<ReturnType<typeof startWebServer>>;

test.beforeAll(async () => {
  web = await startWebServer({
    api_base_url: "http://127.0.0.1:3000",
  });
});

test.afterAll(async () => {
  if (web) {
    await web.close();
  }
});

test("UI agent scripts are loaded in HTML", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  const scripts = await page.locator("script[src]").all();
  const srcs = await Promise.all(scripts.map((s) => s.getAttribute("src")));

  expect(srcs).toContain("/ui-agents-runtime.js");
  expect(srcs).toContain("/ui-agents.js");
  expect(srcs).toContain("/ui-agents-init.js");
  expect(srcs).toContain("/ui-agents-viewer-hook.js");
});

test("window.__uiAgentRuntime is initialized", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.waitForFunction(
    () => {
      const runtime = (window as unknown as Record<string, unknown>).__uiAgentRuntime;
      return runtime != null && typeof runtime === "object";
    },
    { timeout: 10000 },
  );

  const hasRuntime = await page.evaluate(() => {
    return (window as unknown as Record<string, unknown>).__uiAgentRuntime != null;
  });
  expect(hasRuntime).toBe(true);
});

test("four UI agents are registered", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.waitForFunction(
    () => {
      const runtime = (window as unknown as Record<string, unknown>).__uiAgentRuntime as
        | { agents?: Map<string, unknown> }
        | undefined;
      return runtime?.agents != null && runtime.agents.size === 4;
    },
    { timeout: 10000 },
  );

  const agentCount = await page.evaluate(() => {
    const runtime = (window as unknown as Record<string, unknown>).__uiAgentRuntime as {
      agents: Map<string, { shouldTrigger: () => boolean; execute: () => void }>;
    };
    return runtime.agents.size;
  });

  expect(agentCount).toBe(4);
});

test("simulating a search event dispatches through the runtime", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.waitForFunction(
    () => {
      const runtime = (window as unknown as Record<string, unknown>).__uiAgentRuntime as
        | { observe: (event: Record<string, unknown>) => void }
        | undefined;
      return typeof runtime?.observe === "function";
    },
    { timeout: 10000 },
  );

  const observed = await page.evaluate(() => {
    const runtime = (window as unknown as Record<string, unknown>).__uiAgentRuntime as {
      observe: (event: Record<string, unknown>) => void;
      history: Array<Record<string, unknown>>;
    };
    runtime.observe({ type: "search", data: { query: "test flight" } });
    const lastEvent = runtime.history[runtime.history.length - 1];
    return { historyLen: runtime.history.length, lastEvent };
  });

  expect(observed.historyLen).toBeGreaterThan(0);
  expect(observed.lastEvent.type).toBe("search");
  expect(observed.lastEvent.data).toEqual({ query: "test flight" });
});

test("selectObject is monkey-patched by UI agent hooks", async ({ page }) => {
  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.waitForFunction(
    () => {
      const tracer = (window as unknown as Record<string, unknown>).__uiAgentTracer as
        | { trackEntitySelect: (id: string, pos: unknown) => void }
        | undefined;
      return typeof tracer?.trackEntitySelect === "function";
    },
    { timeout: 10000 },
  );

  const isWired = await page.evaluate(() => {
    const runtime = (window as unknown as Record<string, unknown>).__uiAgentRuntime as {
      observe: (event: Record<string, unknown>) => void;
      history: Array<Record<string, unknown>>;
    };
    const historyBefore = runtime.history.length;

    const selectObject = (window as unknown as Record<string, unknown>).selectObject as
      | ((id: string) => void)
      | undefined;
    if (typeof selectObject !== "function") return false;

    selectObject("test-entity-42");

    return runtime.history.length > historyBefore;
  });

  expect(isWired).toBe(true);
});

test("UI agent fetchGraph is intercepted by page.route mock", async ({ page }) => {
  const mockResponse = {
    entities: [
      {
        id: "1",
        entityType: "Object",
        name: "Mocked Entity",
        properties: {},
        confidence: 0.95,
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  };

  await page.route("**/graph/entities*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockResponse),
    });
  });

  await page.goto(`http://127.0.0.1:${web.port}`);

  await page.waitForFunction(
    () => {
      const runtime = (window as unknown as Record<string, unknown>).__uiAgentRuntime as
        | { fetchGraph: (path: string) => Promise<unknown> }
        | undefined;
      return typeof runtime?.fetchGraph === "function";
    },
    { timeout: 10000 },
  );

  const result = await page.evaluate(async () => {
    const runtime = (window as unknown as Record<string, unknown>).__uiAgentRuntime as {
      fetchGraph: (path: string) => Promise<unknown>;
    };
    return runtime.fetchGraph("/graph/entities?q=test");
  });

  expect(result).toEqual(mockResponse);
});
