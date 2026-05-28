import type {
  CompletionRequest,
  CompletionResponse,
  DiscoveredRelationship,
  ExtractedEntity,
  LLMServiceConfig,
} from "./models.js";
import {
  ENTITY_EXTRACTION_PROMPT,
  NARRATIVE_GENERATION_PROMPT,
  RELATIONSHIP_DISCOVERY_PROMPT,
} from "./prompts.js";

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "anthropic/claude-3.5-sonnet";
const DEFAULT_LIGHT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.1;
const DEFAULT_TIMEOUT = 30000;
const MAX_RETRIES = 3;

export class LLMService {
  public readonly config: Required<LLMServiceConfig>;

  constructor(config: LLMServiceConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      defaultModel: config.defaultModel ?? DEFAULT_MODEL,
      lightModel: config.lightModel ?? DEFAULT_LIGHT_MODEL,
      maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: config.temperature ?? DEFAULT_TEMPERATURE,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
    };
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const url = `${this.config.baseUrl}/chat/completions`;
    const model = request.model ?? this.config.defaultModel;

    const body: Record<string, unknown> = {
      model,
      messages: request.messages,
      temperature: request.temperature ?? this.config.temperature,
      max_tokens: request.maxTokens ?? this.config.maxTokens,
    };

    if (request.responseFormat === "json_object") {
      body.response_format = { type: "json_object" };
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 429 && attempt < MAX_RETRIES) {
            const backoff = 2 ** attempt * 1000;
            await this.sleep(backoff);
            continue;
          }

          const errorBody = await response.text().catch(() => "");
          throw new Error(
            `OpenRouter API error: ${response.status} ${response.statusText}${errorBody ? ` — ${errorBody.slice(0, 500)}` : ""}`,
          );
        }

        const data = (await response.json()) as {
          choices: { message: { content: string }; finish_reason: string }[];
          model: string;
          usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        };

        const choice = data.choices[0];

        return {
          content: choice.message.content,
          model: data.model,
          usage: {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          },
          finishReason: choice.finish_reason,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (error instanceof Error && error.name === "AbortError") {
          if (attempt < MAX_RETRIES) {
            const backoff = 2 ** attempt * 1000;
            await this.sleep(backoff);
            continue;
          }
          throw new Error(`Request timed out after ${this.config.timeout}ms`);
        }

        if (
          error instanceof TypeError ||
          (error instanceof Error && "code" in error && error.code === "ECONNRESET")
        ) {
          if (attempt < MAX_RETRIES) {
            const backoff = 2 ** attempt * 1000;
            await this.sleep(backoff);
            continue;
          }
        }

        if (attempt >= MAX_RETRIES) {
          throw lastError;
        }
      }
    }

    throw lastError ?? new Error("Unknown error during completion");
  }

  async extractEntities(
    text: string,
    context?: Record<string, unknown>,
  ): Promise<ExtractedEntity[]> {
    const contextStr = context ? `\nContext: ${JSON.stringify(context)}` : "";
    const messages = [
      {
        role: "system" as const,
        content: ENTITY_EXTRACTION_PROMPT,
      },
      {
        role: "user" as const,
        content: `Extract all entities from the following input:\n\n${text}${contextStr}`,
      },
    ];

    const response = await this.complete({
      messages,
      model: this.config.lightModel,
      responseFormat: "json_object",
      temperature: 0.1,
    });

    return this.parseStructuredResponse<ExtractedEntity[]>(response.content);
  }

  async discoverRelationships(
    entities: ExtractedEntity[],
    context?: string,
  ): Promise<DiscoveredRelationship[]> {
    const entitiesStr = JSON.stringify(entities, null, 2);
    const contextStr = context ? `\nAdditional context:\n${context}` : "";
    const messages = [
      {
        role: "system" as const,
        content: RELATIONSHIP_DISCOVERY_PROMPT,
      },
      {
        role: "user" as const,
        content: `Find relationships between these entities:\n\n${entitiesStr}${contextStr}`,
      },
    ];

    const response = await this.complete({
      messages,
      responseFormat: "json_object",
    });

    return this.parseStructuredResponse<DiscoveredRelationship[]>(response.content);
  }

  async generateNarrative(entityChain: unknown[]): Promise<string> {
    const chainStr = JSON.stringify(entityChain, null, 2);
    const messages = [
      {
        role: "system" as const,
        content: NARRATIVE_GENERATION_PROMPT,
      },
      {
        role: "user" as const,
        content: `Generate a narrative from this chain of entities and events:\n\n${chainStr}`,
      },
    ];

    const response = await this.complete({
      messages,
      responseFormat: "json_object",
      temperature: 0.7,
    });

    const parsed = this.parseStructuredResponse<{ narrative: string }>(response.content);
    return parsed.narrative;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private parseStructuredResponse<T>(content: string): T {
    try {
      return JSON.parse(content) as T;
    } catch {
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]) as T;
      }
      throw new Error(`Failed to parse structured response: ${content.slice(0, 200)}`);
    }
  }
}
