import type { Driver } from "neo4j-driver";
import type { TaskEnvelope } from "../../../packages/agents/src/protocol.js";
import {
  createNeo4jDriver,
  EntityRepository,
  type GraphEntity,
  RelationshipRepository,
} from "../../../packages/graph/src/index.js";
import { type ExtractedEntity, LLMService } from "../../../packages/llm/src/index.js";
import { type AgentWorkerConfig, BaseAgentWorker } from "./worker.js";

const ENTITY_TYPE_MAP: Record<string, GraphEntity["entityType"]> = {
  person: "Person",
  place: "Location",
  organization: "Organization",
  event: "Event",
  object: "Object",
  concept: "Object",
  time: "Object",
  other: "Object",
};

function mapEntityType(llmType: string): GraphEntity["entityType"] {
  return ENTITY_TYPE_MAP[llmType.toLowerCase()] ?? "Object";
}

export interface EntityExtractorConfig {
  neo4jUri: string;
  neo4jUser: string;
  neo4jPassword: string;
  openrouterApiKey: string;
}

export class EntityExtractorAgent extends BaseAgentWorker {
  private readonly entitiesRepo: EntityRepository;
  private readonly relationshipsRepo: RelationshipRepository;
  private readonly llm: LLMService;
  private readonly driver: Driver;

  constructor(config: AgentWorkerConfig, extractorConfig: EntityExtractorConfig) {
    super(config);
    this.driver = createNeo4jDriver({
      uri: extractorConfig.neo4jUri,
      user: extractorConfig.neo4jUser,
      password: extractorConfig.neo4jPassword,
    });
    this.entitiesRepo = new EntityRepository(this.driver);
    this.relationshipsRepo = new RelationshipRepository(this.driver);
    this.llm = new LLMService({ apiKey: extractorConfig.openrouterApiKey });
  }

  protected async processTask(task: TaskEnvelope): Promise<Record<string, unknown>> {
    const { sourceType, sourceId, sourceData } = task.payload as {
      sourceType: string;
      sourceId: string;
      sourceData: Record<string, unknown>;
    };

    this.logger.info("Processing entity extraction", { sourceType, sourceId });

    const sourceText = typeof sourceData === "string" ? sourceData : JSON.stringify(sourceData);

    let extracted: ExtractedEntity[] = [];
    try {
      extracted = await this.llm.extractEntities(sourceText);
    } catch (error) {
      this.logger.warn("LLM extraction failed, retrying once", { error });
      try {
        extracted = await this.llm.extractEntities(sourceText);
      } catch (retryError) {
        this.logger.error("LLM extraction failed after retry", { error: retryError });
        throw retryError;
      }
    }

    if (!extracted || extracted.length === 0) {
      this.logger.info("No entities extracted from source", { sourceType, sourceId });
      return { entityCount: 0, relationshipCount: 0, entityIds: [] };
    }

    const sourceNodeId = await this.getOrCreateSourceNode(sourceType, sourceId);

    const entityIds: string[] = [];
    let relationshipCount = 0;

    for (const ext of extracted) {
      const graphType = mapEntityType(ext.entityType);

      const existing = await this.findExistingEntity(graphType, ext.name);
      let entityId: string;

      if (existing) {
        entityId = existing.id;
        this.logger.debug("Entity already exists, skipping creation", {
          name: ext.name,
          type: graphType,
        });
      } else {
        const created = await this.entitiesRepo.createEntity({
          entityType: graphType,
          name: ext.name,
          properties: {
            description: ext.description ?? "",
            ...ext.properties,
          },
          sourceId,
          confidence: ext.confidence,
        });
        entityId = created.id;
      }

      entityIds.push(entityId);

      const existingRels = await this.relationshipsRepo.getEntityRelationships(
        entityId,
        "outgoing",
        "SOURCE_OF",
      );
      const alreadyLinked = existingRels.some((r) => r.targetId === sourceNodeId);

      if (!alreadyLinked) {
        await this.relationshipsRepo.createRelationship({
          type: "SOURCE_OF",
          sourceId: entityId,
          targetId: sourceNodeId,
          properties: { sourceType, sourceId },
          confidence: ext.confidence,
        });
        relationshipCount++;
      }
    }

    await this.publishEvent("entities_extracted", task.runId, {
      sourceType,
      sourceId,
      entityCount: entityIds.length,
      relationshipCount,
      entityIds,
    });

    return {
      entityCount: entityIds.length,
      relationshipCount,
      entityIds,
    };
  }

  private async getOrCreateSourceNode(sourceType: string, sourceId: string): Promise<string> {
    const sourceName = `${sourceType}:${sourceId}`;
    const existing = await this.entitiesRepo.findEntities({
      type: "Source",
    });
    const match = existing.find((e) => e.name === sourceName);
    if (match) {
      return match.id;
    }

    const source = await this.entitiesRepo.createEntity({
      entityType: "Source",
      name: sourceName,
      properties: { sourceType, sourceId },
      confidence: 1,
    });
    return source.id;
  }

  private async findExistingEntity(
    entityType: GraphEntity["entityType"],
    name: string,
  ): Promise<GraphEntity | null> {
    const results = await this.entitiesRepo.findEntities({
      type: entityType,
      query: name,
    });
    return results.find((e) => e.name === name && e.entityType === entityType) ?? null;
  }
}

export function createEntityExtractorAgent(config: {
  agentId: string;
  databaseUrl: string;
  redisUrl: string;
  neo4jUri: string;
  neo4jUser: string;
  neo4jPassword: string;
  openrouterApiKey: string;
}): AgentWorkerConfig & EntityExtractorConfig {
  return {
    agentId: config.agentId,
    agentType: "entity-extractor",
    agentName: `entity-extractor-${config.agentId}`,
    databaseUrl: config.databaseUrl,
    redisUrl: config.redisUrl,
    pollIntervalMs: 5000,
    claimedTaskTypes: ["extract_entities"],
    heartbeatIntervalMs: 30000,
    neo4jUri: config.neo4jUri,
    neo4jUser: config.neo4jUser,
    neo4jPassword: config.neo4jPassword,
    openrouterApiKey: config.openrouterApiKey,
  };
}
