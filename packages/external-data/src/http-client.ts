/**
 * Rate-Limited HTTP Client for External Data Adapters
 *
 * Provides HTTP request functionality with:
 * - Rate limiting between requests
 * - Timeout handling
 * - Retry logic with exponential backoff
 * - Request/response logging
 */

import type { AdapterConfig } from "./types.js";

interface PendingRequest {
  resolve: (value: Response) => void;
  reject: (reason: Error) => void;
  url: string;
  options: RequestInit;
  attempt: number;
}

export class RateLimitedHttpClient {
  private lastRequestTime = 0;
  private pendingRequests: PendingRequest[] = [];
  private isProcessing = false;

  constructor(private config: AdapterConfig) {}

  /**
   * Make an HTTP GET request with rate limiting and retries.
   */
  async get(url: string, headers?: Record<string, string>): Promise<Response> {
    return this.request(url, { method: "GET", headers });
  }

  /**
   * Make an HTTP request with rate limiting and retries.
   */
  private async request(url: string, options: RequestInit): Promise<Response> {
    return new Promise((resolve, reject) => {
      this.pendingRequests.push({
        resolve,
        reject,
        url,
        options,
        attempt: 0,
      });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.pendingRequests.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;
      const waitTime = Math.max(0, this.config.rateLimitMs - timeSinceLastRequest);

      if (waitTime > 0) {
        await this.delay(waitTime);
      }

      const request = this.pendingRequests.shift();
      if (!request) {
        return;
      }

      this.lastRequestTime = Date.now();

      try {
        const response = await this.executeRequest(request.url, request.options);
        request.resolve(response);
      } catch (error) {
        if (request.attempt < this.config.maxRetries) {
          // Retry with exponential backoff
          request.attempt++;
          const backoffMs = Math.min(1000 * 2 ** request.attempt, 30000);
          await this.delay(backoffMs);
          this.pendingRequests.unshift(request);
        } else {
          request.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    } finally {
      this.isProcessing = false;
      // Process next request if any
      if (this.pendingRequests.length > 0) {
        setTimeout(() => this.processQueue(), 0);
      }
    }
  }

  private async executeRequest(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Request timeout after ${this.config.timeoutMs}ms`);
      }
      throw error;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create a new rate-limited HTTP client.
 */
export function createHttpClient(config: Partial<AdapterConfig> = {}): RateLimitedHttpClient {
  return new RateLimitedHttpClient({
    timeoutMs: 30000,
    rateLimitMs: 5000,
    maxRetries: 3,
    ...config,
  });
}
