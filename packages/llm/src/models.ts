export interface LLMServiceConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
  lightModel?: string;
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
}

export interface CompletionRequest {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  model?: string;
  responseFormat?: "json_object" | "text";
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  finishReason: string;
}

export interface ExtractedEntity {
  name: string;
  entityType: string;
  description?: string;
  properties: Record<string, unknown>;
  confidence: number;
}

export interface DiscoveredRelationship {
  sourceName: string;
  targetName: string;
  relationshipType: string;
  description?: string;
  confidence: number;
  evidence?: string;
}
