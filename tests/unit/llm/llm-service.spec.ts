import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LLMServiceConfig } from "../../../packages/llm/src/index.js";
import { LLMService } from "../../../packages/llm/src/index.js";

function _createMockFetch(): ReturnType<typeof vi.fn> {
  return vi.fn();
}

function mockJsonResponse(
  overrides: Partial<{
    content: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    finishReason: string;
  }> = {},
) {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        choices: [
          {
            message: { content: overrides.content ?? "Hello" },
            finish_reason: overrides.finishReason ?? "stop",
          },
        ],
        model: overrides.model ?? "test-model",
        usage: {
          prompt_tokens: overrides.promptTokens ?? 10,
          completion_tokens: overrides.completionTokens ?? 20,
          total_tokens: overrides.totalTokens ?? 30,
        },
      }),
    text: () => Promise.resolve(""),
  };
}

function mockErrorResponse(status: number, statusText: string, body?: string) {
  return {
    ok: false,
    status,
    statusText,
    json: () => Promise.reject(new Error("Not JSON")),
    text: () => Promise.resolve(body ?? statusText),
  };
}

describe("LLMService", () => {
  const defaultConfig: LLMServiceConfig = {
    apiKey: "test-key",
  };

  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      Promise.resolve(mockJsonResponse() as unknown as Response),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("initializes with minimal config", () => {
      const service = new LLMService({ apiKey: "sk-abc" });
      expect(service).toBeInstanceOf(LLMService);
    });

    it("uses defaults for optional fields", () => {
      const service = new LLMService({ apiKey: "sk-abc" });
      const result = service.config;
      expect(result.baseUrl).toBe("https://openrouter.ai/api/v1");
      expect(result.defaultModel).toBe("anthropic/claude-3.5-sonnet");
      expect(result.lightModel).toBe("openai/gpt-4o-mini");
      expect(result.maxTokens).toBe(4096);
      expect(result.temperature).toBe(0.1);
      expect(result.timeout).toBe(30000);
    });

    it("overrides defaults with provided config", () => {
      const service = new LLMService({
        apiKey: "sk-abc",
        baseUrl: "https://custom.api/v1",
        defaultModel: "custom-model",
        lightModel: "custom-light",
        maxTokens: 2048,
        temperature: 0.5,
        timeout: 15000,
      });
      const result = service.config;
      expect(result.baseUrl).toBe("https://custom.api/v1");
      expect(result.defaultModel).toBe("custom-model");
      expect(result.lightModel).toBe("custom-light");
      expect(result.maxTokens).toBe(2048);
      expect(result.temperature).toBe(0.5);
      expect(result.timeout).toBe(15000);
    });
  });

  describe("complete", () => {
    it("sends request to correct endpoint", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      const service = new LLMService(defaultConfig);

      await service.complete({
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toBe("https://openrouter.ai/api/v1/chat/completions");
    });

    it("includes authorization header", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      const service = new LLMService({ apiKey: "sk-test-key" });

      await service.complete({
        messages: [{ role: "user", content: "Hello" }],
      });

      const options = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = options.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer sk-test-key");
    });

    it("sends messages and model in body", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      const service = new LLMService(defaultConfig);

      await service.complete({
        messages: [
          { role: "system", content: "You are a bot" },
          { role: "user", content: "Hi" },
        ],
        model: "custom-model",
      });

      const options = mockFetch.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.messages).toHaveLength(2);
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].content).toBe("Hi");
      expect(body.model).toBe("custom-model");
    });

    it("returns structured response", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        mockJsonResponse({
          content: "Response text",
          model: "test-model",
          promptTokens: 15,
          completionTokens: 25,
          totalTokens: 40,
          finishReason: "stop",
        }) as unknown as Response,
      );

      const service = new LLMService(defaultConfig);
      const result = await service.complete({
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(result.content).toBe("Response text");
      expect(result.model).toBe("test-model");
      expect(result.usage.promptTokens).toBe(15);
      expect(result.usage.completionTokens).toBe(25);
      expect(result.usage.totalTokens).toBe(40);
      expect(result.finishReason).toBe("stop");
    });

    it("includes response_format when json_object is requested", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      const service = new LLMService(defaultConfig);

      await service.complete({
        messages: [{ role: "user", content: "Extract" }],
        responseFormat: "json_object",
      });

      const options = mockFetch.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.response_format).toEqual({ type: "json_object" });
    });

    it("retries on 429 and succeeds", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch
        .mockResolvedValueOnce(mockErrorResponse(429, "Too Many Requests") as unknown as Response)
        .mockResolvedValueOnce(mockErrorResponse(429, "Too Many Requests") as unknown as Response)
        .mockResolvedValueOnce(
          mockJsonResponse({ content: "Success after retry" }) as unknown as Response,
        );

      const service = new LLMService(defaultConfig);
      const result = await service.complete({
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.content).toBe("Success after retry");
    });

    it("retries on network error and succeeds", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce(
          mockJsonResponse({ content: "Success after network retry" }) as unknown as Response,
        );

      const service = new LLMService(defaultConfig);
      const result = await service.complete({
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result.content).toBe("Success after network retry");
    });

    it("throws on non-retryable HTTP error", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockReset();
      mockFetch.mockResolvedValue(mockErrorResponse(400, "Bad Request") as unknown as Response);

      const service = new LLMService(defaultConfig);

      await expect(
        service.complete({
          messages: [{ role: "user", content: "Hello" }],
        }),
      ).rejects.toThrow("OpenRouter API error: 400 Bad Request");
    });

    it("throws on timeout", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      mockFetch.mockReset();
      mockFetch.mockRejectedValue(
        Object.assign(new Error("The operation was aborted"), { name: "AbortError" }),
      );

      const service = new LLMService({ ...defaultConfig, timeout: 50 });

      await expect(
        service.complete({
          messages: [{ role: "user", content: "Hello" }],
        }),
      ).rejects.toThrow("timed out");
    });

    it("throws after exhausting 429 retries", async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        mockErrorResponse(429, "Too Many Requests") as unknown as Response,
      );

      const service = new LLMService(defaultConfig);

      await expect(
        service.complete({
          messages: [{ role: "user", content: "Hello" }],
        }),
      ).rejects.toThrow("OpenRouter API error: 429 Too Many Requests");
    });
  });

  describe("extractEntities", () => {
    it("uses light model and json_object format", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      const service = new LLMService(defaultConfig);

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          content: JSON.stringify([
            {
              name: "Test Entity",
              entityType: "organization",
              properties: {},
              confidence: 0.9,
            },
          ]),
        }) as unknown as Response,
      );

      const result = await service.extractEntities("Some input text");

      const options = mockFetch.mock.calls[0][1] as RequestInit;
      const body = JSON.parse(options.body as string);
      expect(body.model).toBe("openai/gpt-4o-mini");
      expect(body.response_format).toEqual({ type: "json_object" });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Test Entity");
    });
  });

  describe("discoverRelationships", () => {
    it("sends entities in prompt and parses response", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      const service = new LLMService(defaultConfig);
      const entities = [
        {
          name: "Alice",
          entityType: "person" as const,
          properties: {},
          confidence: 0.95,
        },
        {
          name: "Acme Corp",
          entityType: "organization" as const,
          properties: {},
          confidence: 0.9,
        },
      ];

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          content: JSON.stringify([
            {
              sourceName: "Alice",
              targetName: "Acme Corp",
              relationshipType: "works_for",
              confidence: 0.9,
              evidence: "Known relationship",
            },
          ]),
        }) as unknown as Response,
      );

      const result = await service.discoverRelationships(entities);

      expect(result).toHaveLength(1);
      expect(result[0].sourceName).toBe("Alice");
      expect(result[0].relationshipType).toBe("works_for");
    });
  });

  describe("generateNarrative", () => {
    it("returns narrative string from parsed JSON", async () => {
      const mockFetch = vi.mocked(globalThis.fetch);
      const service = new LLMService(defaultConfig);

      mockFetch.mockResolvedValueOnce(
        mockJsonResponse({
          content: JSON.stringify({
            narrative: "A sequence of events occurred.",
            title: "Event Summary",
            keyEvents: ["Event A", "Event B"],
            timestamp: "2025-01-01T00:00:00.000Z",
          }),
        }) as unknown as Response,
      );

      const result = await service.generateNarrative([{ event: "Test" }]);

      expect(result).toBe("A sequence of events occurred.");
    });
  });
});
