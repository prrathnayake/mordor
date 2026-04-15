import { randomUUID } from "node:crypto";
import type { TaskEnvelope } from "../../../packages/agents/src/protocol.js";
import { type AgentWorkerConfig, BaseAgentWorker } from "./worker.js";

export class CollectorAgent extends BaseAgentWorker {
  protected async processTask(task: TaskEnvelope): Promise<Record<string, unknown>> {
    const { source, targetEntityIds } = task;

    this.logger.info("Processing collect task", { source, entityCount: targetEntityIds.length });

    const observations: Array<Record<string, unknown>> = [];

    switch (source) {
      case "live_flights": {
        const result = await this.collectFlightData(targetEntityIds);
        observations.push(...result);
        break;
      }
      case "external_layers": {
        const result = await this.collectExternalLayerData(targetEntityIds);
        observations.push(...result);
        break;
      }
      default:
        this.logger.warn("Unknown collection source", { source });
    }

    return {
      observations,
      count: observations.length,
    };
  }

  private async collectFlightData(entityIds: string[]): Promise<Array<Record<string, unknown>>> {
    const observations: Array<Record<string, unknown>> = [];

    for (const entityId of entityIds) {
      observations.push({
        id: `obs_${randomUUID()}`,
        source: "live_flights",
        entityType: "flight",
        entityId,
        timestamp: new Date().toISOString(),
        data: { flightId: entityId },
        confidence: 0.95,
      });
    }

    return observations;
  }

  private async collectExternalLayerData(
    entityIds: string[],
  ): Promise<Array<Record<string, unknown>>> {
    const observations: Array<Record<string, unknown>> = [];

    for (const entityId of entityIds) {
      observations.push({
        id: `obs_${randomUUID()}`,
        source: "external_layers",
        entityType: "object",
        entityId,
        timestamp: new Date().toISOString(),
        data: { layerId: entityId },
        confidence: 0.85,
      });
    }

    return observations;
  }
}

export function createCollectorAgent(config: {
  agentId: string;
  databaseUrl: string;
  redisUrl: string;
}): AgentWorkerConfig {
  return {
    agentId: config.agentId,
    agentType: "collector",
    agentName: `collector-${config.agentId}`,
    databaseUrl: config.databaseUrl,
    redisUrl: config.redisUrl,
    pollIntervalMs: 5000,
    claimedTaskTypes: ["collect"],
    heartbeatIntervalMs: 30000,
  };
}
