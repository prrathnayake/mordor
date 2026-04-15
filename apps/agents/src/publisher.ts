import { randomUUID } from "node:crypto";
import type {
  AgentInsight,
  TaskEnvelope,
  UIInsightAction,
  UIInsightEvent,
} from "../../../packages/agents/src/protocol.js";
import { type AgentWorkerConfig, BaseAgentWorker } from "./worker.js";

interface PublishConfig {
  dedupeWindowMs: number;
  minConfidence: number;
  defaultTtlMs: number;
}

const DEFAULT_PUBLISH_CONFIG: PublishConfig = {
  dedupeWindowMs: 300000,
  minConfidence: 0.6,
  defaultTtlMs: 60000,
};

const SEVERITY_ACTIONS: Record<string, UIInsightAction[]> = {
  low: [
    { id: "inspect", label: "Inspect", actionType: "inspect" },
    { id: "dismiss", label: "Dismiss", actionType: "dismiss" },
  ],
  medium: [
    { id: "inspect", label: "Inspect", actionType: "inspect" },
    { id: "track", label: "Track", actionType: "track" },
    { id: "dismiss", label: "Dismiss", actionType: "dismiss" },
  ],
  high: [
    { id: "inspect", label: "Inspect", actionType: "inspect" },
    { id: "track", label: "Track", actionType: "track" },
    { id: "open_timeline", label: "Timeline", actionType: "open_timeline" },
  ],
  critical: [
    { id: "inspect", label: "Inspect", actionType: "inspect" },
    { id: "track", label: "Track", actionType: "track" },
    { id: "open_timeline", label: "Timeline", actionType: "open_timeline" },
  ],
};

export class PublisherAgent extends BaseAgentWorker {
  private readonly publishConfig: PublishConfig;

  constructor(config: AgentWorkerConfig, publishConfig?: Partial<PublishConfig>) {
    super(config);
    this.publishConfig = { ...DEFAULT_PUBLISH_CONFIG, ...publishConfig };
  }

  protected async processTask(task: TaskEnvelope): Promise<Record<string, unknown>> {
    const { targetEntityIds, payload } = task;
    const hypotheses = (payload.hypotheses as AgentInsight[]) ?? [];

    this.logger.info("Processing publish task", {
      entityCount: targetEntityIds.length,
      hypothesisCount: hypotheses.length,
    });

    const published: UIInsightEvent[] = [];
    const suppressed: string[] = [];

    for (const hypothesis of hypotheses) {
      if (hypothesis.confidence < this.publishConfig.minConfidence) {
        suppressed.push(hypothesis.id);
        this.logger.debug("Insight suppressed below confidence threshold", {
          id: hypothesis.id,
          confidence: hypothesis.confidence,
          minRequired: this.publishConfig.minConfidence,
        });
        continue;
      }

      const isDuplicate = await this.checkDedupe(hypothesis);
      if (isDuplicate) {
        suppressed.push(hypothesis.id);
        this.logger.debug("Insight suppressed as duplicate", { id: hypothesis.id });
        continue;
      }

      const uiEvent = this.convertToUIEvent(hypothesis);
      await this.publishEvent(
        "insight.published",
        task.runId,
        uiEvent as unknown as Record<string, unknown>,
      );

      await this.markAsPublished(hypothesis);

      published.push(uiEvent);
      this.logger.info("Insight published", { id: hypothesis.id, type: uiEvent.type });
    }

    return {
      published,
      suppressed,
      publishedCount: published.length,
      suppressedCount: suppressed.length,
    };
  }

  private convertToUIEvent(insight: AgentInsight): UIInsightEvent {
    const eventType = this.getEventTypeForSeverity(insight.severity);
    const ttlMs = this.getTtlForSeverity(insight.severity);

    const actions = SEVERITY_ACTIONS[insight.severity] ?? SEVERITY_ACTIONS.low;

    const location = insight.location
      ? { lat: insight.location.lat, lng: insight.location.lon }
      : null;

    return {
      id: `uie_${randomUUID()}`,
      type: eventType,
      insightId: insight.id,
      severity: insight.severity,
      title: insight.title,
      message: insight.description,
      location,
      entityIds: insight.entities,
      confidence: insight.confidence,
      timestamp: insight.timestamp,
      ttlMs,
      actions,
    };
  }

  private getEventTypeForSeverity(severity: string): UIInsightEvent["type"] {
    switch (severity) {
      case "critical":
        return "map_popup";
      case "high":
        return "alert_badge";
      case "medium":
        return "event_log";
      default:
        return "event_log";
    }
  }

  private getTtlForSeverity(severity: string): number {
    switch (severity) {
      case "critical":
        return 300000;
      case "high":
        return 120000;
      case "medium":
        return 60000;
      default:
        return this.publishConfig.defaultTtlMs;
    }
  }

  private async checkDedupe(insight: AgentInsight): Promise<boolean> {
    const _dedupeKey = this.generateDedupeKey(insight);
    const windowStart = new Date(Date.now() - this.publishConfig.dedupeWindowMs);

    const result = await this.db.pool.query(
      `SELECT 1 FROM agent_insights
       WHERE type = $1
         AND entities && $2::text[]
         AND timestamp > $3
         AND published = true
       LIMIT 1`,
      [insight.type, insight.entities, windowStart],
    );

    return result.rows.length > 0;
  }

  private generateDedupeKey(insight: AgentInsight): string {
    const timeBucket = new Date(
      Math.floor(Date.now() / this.publishConfig.dedupeWindowMs) *
        this.publishConfig.dedupeWindowMs,
    )
      .toISOString()
      .slice(0, 16);
    return `${insight.type}:${insight.entities.sort().join(",")}:${timeBucket}`;
  }

  private async markAsPublished(insight: AgentInsight): Promise<void> {
    await this.db.pool.query(
      `UPDATE agent_insights
       SET published = true, published_at = NOW(), event_status = 'published'
       WHERE insight_id = $1`,
      [insight.id],
    );
  }
}

export function createPublisherAgent(config: {
  agentId: string;
  databaseUrl: string;
  redisUrl: string;
}): AgentWorkerConfig {
  return {
    agentId: config.agentId,
    agentType: "publisher",
    agentName: `publisher-${config.agentId}`,
    databaseUrl: config.databaseUrl,
    redisUrl: config.redisUrl,
    pollIntervalMs: 5000,
    claimedTaskTypes: ["publish"],
    heartbeatIntervalMs: 30000,
  };
}
