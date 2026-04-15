import { randomUUID } from "node:crypto";
import type { AgentInsight, TaskEnvelope } from "../../../packages/agents/src/protocol.js";
import { type AgentWorkerConfig, BaseAgentWorker } from "./worker.js";

interface AnomalyConfig {
  deviationThreshold: number;
  minObservations: number;
}

const DEFAULT_ANOMALY_CONFIG: AnomalyConfig = {
  deviationThreshold: 2.0,
  minObservations: 3,
};

export class DetectorAgent extends BaseAgentWorker {
  private readonly anomalyConfig: AnomalyConfig;

  constructor(config: AgentWorkerConfig, anomalyConfig?: Partial<AnomalyConfig>) {
    super(config);
    this.anomalyConfig = { ...DEFAULT_ANOMALY_CONFIG, ...anomalyConfig };
  }

  protected async processTask(task: TaskEnvelope): Promise<Record<string, unknown>> {
    const { targetEntityIds, payload } = task;
    const observations = (payload.observations as Array<Record<string, unknown>>) ?? [];

    this.logger.info("Processing detect task", {
      entityCount: targetEntityIds.length,
      observationCount: observations.length,
    });

    const anomalies: AgentInsight[] = [];

    for (const entityId of targetEntityIds) {
      const entityObservations = observations.filter((obs) => obs.entityId === entityId);

      if (entityObservations.length < this.anomalyConfig.minObservations) {
        continue;
      }

      const anomaly = this.detectAnomaly(entityId, entityObservations);
      if (anomaly) {
        anomalies.push(anomaly);
        await this.publishEvent(
          "anomaly.detected",
          task.runId,
          anomaly as unknown as Record<string, unknown>,
        );
      }
    }

    return {
      anomalies,
      count: anomalies.length,
    };
  }

  private detectAnomaly(
    entityId: string,
    observations: Array<Record<string, unknown>>,
  ): AgentInsight | null {
    const values = observations
      .map((o) => o.data as Record<string, unknown>)
      .filter((d) => d.value !== undefined)
      .map((d) => Number(d.value));

    if (values.length < this.anomalyConfig.minObservations) {
      return null;
    }

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const lastValue = values[values.length - 1];
    const deviation = Math.abs((lastValue - mean) / (stdDev || 1));

    if (deviation > this.anomalyConfig.deviationThreshold) {
      const severity = deviation > 3 ? "critical" : deviation > 2.5 ? "high" : "medium";

      return {
        id: `insight_${randomUUID()}`,
        type: "anomaly",
        severity: severity as AgentInsight["severity"],
        title: `Anomalous behavior detected for ${entityId}`,
        description: `Deviation of ${deviation.toFixed(2)} standard deviations from normal pattern. Last value: ${lastValue}, mean: ${mean.toFixed(2)}`,
        location: null,
        entities: [entityId],
        confidence: Math.min(0.95, deviation / 4),
        timestamp: new Date().toISOString(),
        published: false,
        eventStatus: "candidate",
        runId: "",
        hypothesisId: null,
        freshnessMs: 60000,
        expiresAt: null,
      };
    }

    return null;
  }
}

export function createDetectorAgent(config: {
  agentId: string;
  databaseUrl: string;
  redisUrl: string;
}): AgentWorkerConfig {
  return {
    agentId: config.agentId,
    agentType: "detector",
    agentName: `detector-${config.agentId}`,
    databaseUrl: config.databaseUrl,
    redisUrl: config.redisUrl,
    pollIntervalMs: 5000,
    claimedTaskTypes: ["detect_anomaly"],
    heartbeatIntervalMs: 30000,
  };
}
