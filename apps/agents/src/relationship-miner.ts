import type { Driver } from "neo4j-driver";
import type { TaskEnvelope } from "../../../packages/agents/src/protocol.js";
import {
  createNeo4jDriver,
  EntityRepository,
  type GraphEntity,
  type GraphRelationship,
  RelationshipRepository,
} from "../../../packages/graph/src/index.js";
import {
  type DiscoveredRelationship,
  type ExtractedEntity,
  LLMService,
} from "../../../packages/llm/src/index.js";
import { type AgentWorkerConfig, BaseAgentWorker } from "./worker.js";

const REL_TYPE_MAP: Record<string, GraphRelationship["type"]> = {
  works_for: "ASSOCIATED_WITH",
  employed_by: "ASSOCIATED_WITH",
  located_in: "LOCATED_AT",
  located_at: "LOCATED_AT",
  located_on: "LOCATED_AT",
  mentions: "MENTIONS",
  causes: "CAUSES",
  correlates_with: "CORRELATES_WITH",
  correlated_with: "CORRELATES_WITH",
  links_to: "LINKS_TO",
  linked_to: "LINKS_TO",
  occurred_during: "OCCURRED_DURING",
  source_of: "SOURCE_OF",
  associated_with: "ASSOCIATED_WITH",
};

function mapRelationshipType(llmType: string): GraphRelationship["type"] {
  const key = llmType.toLowerCase().replace(/\s+/g, "_");
  return REL_TYPE_MAP[key] ?? "ASSOCIATED_WITH";
}

function mapGraphEntityType(entityType: GraphEntity["entityType"]): string {
  switch (entityType) {
    case "Person":
      return "person";
    case "Location":
      return "place";
    case "Organization":
      return "organization";
    case "Event":
      return "event";
    case "Object":
      return "object";
    case "Source":
      return "source";
    case "Article":
      return "article";
    case "Alert":
      return "alert";
    case "Incident":
      return "incident";
    case "Layer":
      return "layer";
    default:
      return "other";
  }
}

export interface RelationshipMinerConfig {
  neo4jUri: string;
  neo4jUser: string;
  neo4jPassword: string;
  openrouterApiKey: string;
}

export class RelationshipMinerAgent extends BaseAgentWorker {
  private readonly entitiesRepo: EntityRepository;
  private readonly relationshipsRepo: RelationshipRepository;
  private readonly llm: LLMService;
  private readonly driver: Driver;

  constructor(config: AgentWorkerConfig, minerConfig: RelationshipMinerConfig) {
    super(config);
    this.driver = createNeo4jDriver({
      uri: minerConfig.neo4jUri,
      user: minerConfig.neo4jUser,
      password: minerConfig.neo4jPassword,
    });
    this.entitiesRepo = new EntityRepository(this.driver);
    this.relationshipsRepo = new RelationshipRepository(this.driver);
    this.llm = new LLMService({ apiKey: minerConfig.openrouterApiKey });
  }

  protected async processTask(task: TaskEnvelope): Promise<Record<string, unknown>> {
    const {
      focusEntityId,
      sourceTypes,
      limit = 50,
    } = task.payload as {
      focusEntityId?: string;
      sourceTypes?: string[];
      limit?: number;
    };

    this.logger.info("Processing relationship mining", {
      focusEntityId: focusEntityId ?? "none",
      limit,
    });

    let entities: GraphEntity[] = [];

    if (focusEntityId) {
      entities = await this.getEntitiesAroundFocus(focusEntityId);
    } else {
      entities = await this.findUnlinkedEntities(limit);
    }

    if (entities.length < 2) {
      this.logger.info("Not enough entities to mine relationships", {
        entityCount: entities.length,
      });
      return { relationshipCount: 0, relationshipIds: [], confidenceSummary: {} };
    }

    const extractedEntities: ExtractedEntity[] = entities.map((e) => ({
      name: e.name,
      entityType: mapGraphEntityType(e.entityType),
      properties: e.properties,
      confidence: e.confidence,
    }));

    const contextStr = sourceTypes ? `Source types: ${sourceTypes.join(", ")}` : undefined;

    let discovered: DiscoveredRelationship[];
    try {
      discovered = await this.llm.discoverRelationships(extractedEntities, contextStr);
    } catch (error) {
      this.logger.warn("LLM relationship discovery failed, retrying once", { error });
      try {
        discovered = await this.llm.discoverRelationships(extractedEntities, contextStr);
      } catch (retryError) {
        this.logger.error("Relationship discovery failed after retry", {
          error: retryError,
        });
        throw retryError;
      }
    }

    if (!discovered || discovered.length === 0) {
      this.logger.info("No relationships discovered");
      return { relationshipCount: 0, relationshipIds: [], confidenceSummary: {} };
    }

    const nameToId = new Map(entities.map((e) => [e.name, e.id]));

    const createdIds: string[] = [];
    const confidences: number[] = [];

    for (const rel of discovered) {
      const srcId = nameToId.get(rel.sourceName);
      const tgtId = nameToId.get(rel.targetName);

      if (!srcId || !tgtId) {
        this.logger.debug("Skipping relationship: entity not found in graph", {
          sourceName: rel.sourceName,
          targetName: rel.targetName,
        });
        continue;
      }

      if (srcId === tgtId) continue;

      const isDuplicate = await this.isDuplicateRelationship(srcId, tgtId);
      if (isDuplicate) continue;

      const mappedType = mapRelationshipType(rel.relationshipType);

      try {
        const created = await this.relationshipsRepo.createRelationship({
          type: mappedType,
          sourceId: srcId,
          targetId: tgtId,
          properties: {
            originalType: rel.relationshipType,
            description: rel.description ?? "",
            evidence: rel.evidence ?? "",
          },
          confidence: rel.confidence,
        });
        createdIds.push(created.id);
        confidences.push(rel.confidence);
      } catch (error) {
        this.logger.warn("Failed to create relationship", {
          sourceId: srcId,
          targetId: tgtId,
          error,
        });
      }
    }

    await this.publishEvent("relationships_discovered", task.runId, {
      focusEntityId: focusEntityId ?? null,
      relationshipCount: createdIds.length,
      relationshipIds: createdIds,
    });

    const confidenceSummary = {
      min: confidences.length > 0 ? Math.min(...confidences) : 0,
      max: confidences.length > 0 ? Math.max(...confidences) : 0,
      avg: confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
      count: confidences.length,
    };

    return {
      relationshipCount: createdIds.length,
      relationshipIds: createdIds,
      confidenceSummary,
    };
  }

  private async getEntitiesAroundFocus(focusEntityId: string): Promise<GraphEntity[]> {
    const focusEntity = await this.entitiesRepo.getEntityById(focusEntityId);
    if (!focusEntity) {
      throw new Error(`Focus entity ${focusEntityId} not found in graph`);
    }

    const relationships = await this.relationshipsRepo.getEntityRelationships(
      focusEntityId,
      "both",
    );

    const neighborIds = new Set<string>();
    for (const rel of relationships) {
      if (rel.sourceId !== focusEntityId) neighborIds.add(rel.sourceId);
      if (rel.targetId !== focusEntityId) neighborIds.add(rel.targetId);
    }

    const connectedEntities: GraphEntity[] = [focusEntity];
    for (const nid of neighborIds) {
      const neighbor = await this.entitiesRepo.getEntityById(nid);
      if (neighbor) {
        connectedEntities.push(neighbor);
      }
    }

    return connectedEntities;
  }

  private async findUnlinkedEntities(limit: number): Promise<GraphEntity[]> {
    const recent = await this.entitiesRepo.findEntities({ limit: limit * 2 });

    const unlinked: GraphEntity[] = [];
    for (const entity of recent) {
      if (entity.entityType === "Source") continue;

      const rels = await this.relationshipsRepo.getEntityRelationships(entity.id, "both");

      if (rels.length < 2) {
        unlinked.push(entity);
        if (unlinked.length >= limit) break;
      }
    }

    return unlinked;
  }

  private async isDuplicateRelationship(sourceId: string, targetId: string): Promise<boolean> {
    const existing = await this.relationshipsRepo.getEntityRelationships(sourceId, "outgoing");
    return existing.some((r) => r.targetId === targetId);
  }
}

export function createRelationshipMinerAgent(config: {
  agentId: string;
  databaseUrl: string;
  redisUrl: string;
  neo4jUri: string;
  neo4jUser: string;
  neo4jPassword: string;
  openrouterApiKey: string;
}): AgentWorkerConfig & RelationshipMinerConfig {
  return {
    agentId: config.agentId,
    agentType: "relationship-miner",
    agentName: `relationship-miner-${config.agentId}`,
    databaseUrl: config.databaseUrl,
    redisUrl: config.redisUrl,
    pollIntervalMs: 5000,
    claimedTaskTypes: ["mine_relationships"],
    heartbeatIntervalMs: 30000,
    neo4jUri: config.neo4jUri,
    neo4jUser: config.neo4jUser,
    neo4jPassword: config.neo4jPassword,
    openrouterApiKey: config.openrouterApiKey,
  };
}
