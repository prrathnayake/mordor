import { createClient, type RedisClientType } from "redis";
import type { Logger } from "../../logging/src/index.js";

export interface AgentEvent {
  type: string;
  runId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface AgentEventBusConfig {
  redisUrl: string;
}

export class AgentEventBus {
  private readonly client: RedisClientType;
  private readonly logger: Logger;
  private readonly subscriber: RedisClientType;
  private handlers: Map<string, (event: AgentEvent) => void | Promise<void>> = new Map();
  private connected = false;

  constructor(input: { redisUrl: string; logger: Logger }) {
    this.logger = input.logger;
    this.client = createClient({ url: input.redisUrl });
    this.subscriber = createClient({ url: input.redisUrl });
  }

  async connect(): Promise<void> {
    await Promise.all([this.client.connect(), this.subscriber.connect()]);
    this.connected = true;
    this.logger.info("Agent event bus connected", { redisUrl: this.client.options.url });

    await this.subscriber.subscribe("agent:events", (message) => {
      this.handleMessage(message);
    });
  }

  async disconnect(): Promise<void> {
    await Promise.all([this.client.quit(), this.subscriber.quit()]);
    this.connected = false;
  }

  async publish(channel: string, event: AgentEvent): Promise<void> {
    if (!this.connected) {
      this.logger.warn("Event bus not connected, skipping publish", { channel });
      return;
    }

    const message = JSON.stringify(event);
    await this.client.publish(channel, message);
  }

  async publishToAgent(event: AgentEvent): Promise<void> {
    await this.publish("agent:events", event);
  }

  async subscribe(
    eventType: string,
    handler: (event: AgentEvent) => void | Promise<void>,
  ): Promise<void> {
    this.handlers.set(eventType, handler);
  }

  private async handleMessage(message: string): Promise<void> {
    try {
      const event = JSON.parse(message) as AgentEvent;

      for (const [eventType, handler] of this.handlers) {
        if (eventType === event.type || eventType === "*") {
          try {
            await handler(event);
          } catch (error) {
            this.logger.error("Event handler error", { eventType, error });
          }
        }
      }
    } catch (error) {
      this.logger.error("Failed to parse event message", { error });
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}
