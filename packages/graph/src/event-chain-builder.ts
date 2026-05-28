import { randomUUID } from "node:crypto";
import type { Driver, Session } from "neo4j-driver";
import type { EntityRepository, GraphEntity } from "./entity-repository.js";
import type { GraphTraversal } from "./graph-traversal.js";
import type { RelationshipRepository } from "./relationship-repository.js";

export interface EventChainStep {
  sequenceNumber: number;
  entityId: string;
  entityName: string;
  entityType: string;
  timestamp: string;
  location?: { lat: number; lng: number };
  description?: string;
  incomingRelationships: Array<{
    type: string;
    fromEntityId: string;
    fromEntityName: string;
    confidence: number;
  }>;
  outgoingRelationships: Array<{
    type: string;
    toEntityId: string;
    toEntityName: string;
    confidence: number;
  }>;
  confidence: number;
}

export interface EventChain {
  chainId: string;
  seedEntityId: string;
  seedEntityName: string;
  steps: EventChainStep[];
  totalConfidence: number;
  chainType: "causal" | "correlated" | "temporal";
  createdAt: string;
  metadata: Record<string, unknown>;
}

function getEntityTimestamp(entity: GraphEntity): string {
  return (entity.properties?.observedAt as string) ?? entity.createdAt;
}

function getEntityLocation(entity: GraphEntity): { lat: number; lng: number } | undefined {
  const props = entity.properties ?? {};
  if (props.lat !== undefined && props.lng !== undefined) {
    return { lat: Number(props.lat), lng: Number(props.lng) };
  }
  if (props.latitude !== undefined && props.longitude !== undefined) {
    return { lat: Number(props.latitude), lng: Number(props.longitude) };
  }
  if (props.location && typeof props.location === "object") {
    const loc = props.location as Record<string, unknown>;
    if (typeof loc.lat === "number" && typeof loc.lng === "number") {
      return { lat: loc.lat, lng: loc.lng };
    }
  }
  return undefined;
}

function getEntityDescription(entity: GraphEntity): string | undefined {
  return (
    (entity.properties?.description as string) ??
    (entity.properties?.summary as string) ??
    undefined
  );
}

function _integerParam(value: number): {
  toNumber(): number;
  toString(): string;
  low: number;
  high: number;
} {
  return { toNumber: () => value, toString: () => String(value), low: value, high: 0 };
}

export class EventChainBuilder {
  constructor(
    private driver: Driver,
    private entityRepo: EntityRepository,
    private relationshipRepo: RelationshipRepository,
    private traversal: GraphTraversal,
  ) {}

  private getSession(): Session {
    return this.driver.session();
  }

  async buildChain(
    entityId: string,
    options?: {
      depth?: number;
      chainType?: "causal" | "correlated" | "temporal";
      timeWindowMs?: number;
    },
  ): Promise<EventChain> {
    const depth = options?.depth ?? 5;
    const chainType = options?.chainType ?? "causal";
    const timeWindowMs = options?.timeWindowMs;

    const subgraph = await this.traversal.getSubgraph(entityId, depth);

    const seedEntity = subgraph.entities.find((e) => e.id === entityId);
    if (!seedEntity) {
      throw new Error(`Seed entity ${entityId} not found in subgraph`);
    }

    const allowedTypes = new Set<string>(
      chainType === "temporal"
        ? []
        : chainType === "correlated"
          ? ["CORRELATES_WITH"]
          : ["CAUSES", "CORRELATES_WITH"],
    );

    const filteredRelationships =
      chainType === "temporal"
        ? subgraph.relationships
        : subgraph.relationships.filter((r) => allowedTypes.has(r.type));

    const relatedEntityIds = new Set<string>();
    for (const rel of filteredRelationships) {
      relatedEntityIds.add(rel.sourceId);
      relatedEntityIds.add(rel.targetId);
    }
    relatedEntityIds.add(entityId);

    const chainEntities = subgraph.entities.filter((e) => relatedEntityIds.has(e.id));

    const sorted = [...chainEntities].sort((a, b) => {
      const tA = getEntityTimestamp(a);
      const tB = getEntityTimestamp(b);
      return tA.localeCompare(tB);
    });

    const now = new Date().toISOString();
    const seedTimestamp = getEntityTimestamp(seedEntity);
    const seedTime = new Date(seedTimestamp).getTime();

    const steps: EventChainStep[] = [];
    let stepIndex = 0;

    for (const entity of sorted) {
      const entityTimestamp = getEntityTimestamp(entity);
      if (timeWindowMs !== undefined) {
        const entityTime = new Date(entityTimestamp).getTime();
        if (Math.abs(entityTime - seedTime) > timeWindowMs) {
          continue;
        }
      }

      const incomingRels = filteredRelationships
        .filter((r) => r.targetId === entity.id)
        .map((r) => {
          const fromEntity = subgraph.entities.find((e) => e.id === r.sourceId);
          return {
            type: r.type,
            fromEntityId: r.sourceId,
            fromEntityName: fromEntity?.name ?? "unknown",
            confidence: r.confidence,
          };
        });

      const outgoingRels = filteredRelationships
        .filter((r) => r.sourceId === entity.id)
        .map((r) => {
          const toEntity = subgraph.entities.find((e) => e.id === r.targetId);
          return {
            type: r.type,
            toEntityId: r.targetId,
            toEntityName: toEntity?.name ?? "unknown",
            confidence: r.confidence,
          };
        });

      const allConfidences = [...incomingRels, ...outgoingRels].map((r) => r.confidence);
      const stepConfidence =
        allConfidences.length > 0
          ? allConfidences.reduce((sum, c) => sum + c, 0) / allConfidences.length
          : entity.confidence;

      steps.push({
        sequenceNumber: stepIndex++,
        entityId: entity.id,
        entityName: entity.name,
        entityType: entity.entityType,
        timestamp: entityTimestamp,
        location: getEntityLocation(entity),
        description: getEntityDescription(entity),
        incomingRelationships: incomingRels,
        outgoingRelationships: outgoingRels,
        confidence: stepConfidence,
      });
    }

    const totalConfidence =
      steps.length > 0 ? steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length : 0;

    return {
      chainId: randomUUID(),
      seedEntityId: entityId,
      seedEntityName: seedEntity.name,
      steps,
      totalConfidence,
      chainType,
      createdAt: now,
      metadata: {},
    };
  }

  async findCausalPath(
    fromEntityId: string,
    toEntityId: string,
    maxDepth: number = 10,
  ): Promise<EventChain | null> {
    const paths = await this.relationshipRepo.findPaths(fromEntityId, toEntityId, maxDepth);

    if (paths.length === 0 || paths[0].length === 0) {
      return null;
    }

    const pathRels = paths[0];

    const entityIds = new Set<string>();
    entityIds.add(fromEntityId);
    entityIds.add(toEntityId);
    for (const rel of pathRels) {
      entityIds.add(rel.sourceId);
      entityIds.add(rel.targetId);
    }

    const entityMap = new Map<string, GraphEntity>();
    for (const id of entityIds) {
      const entity = await this.entityRepo.getEntityById(id);
      if (entity) {
        entityMap.set(id, entity);
      }
    }

    const sorted: GraphEntity[] = [];
    let currentId = fromEntityId;
    const visited = new Set<string>();
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const entity = entityMap.get(currentId);
      if (entity) {
        sorted.push(entity);
      }
      const nextRel = pathRels.find((r) => r.sourceId === currentId);
      if (nextRel) {
        currentId = nextRel.targetId;
      } else {
        break;
      }
    }

    const seedEntity = entityMap.get(fromEntityId);
    const steps: EventChainStep[] = [];
    const now = new Date().toISOString();

    for (let i = 0; i < sorted.length; i++) {
      const entity = sorted[i];
      const outgoing = pathRels
        .filter((r) => r.sourceId === entity.id)
        .map((r) => ({
          type: r.type,
          toEntityId: r.targetId,
          toEntityName: entityMap.get(r.targetId)?.name ?? "unknown",
          confidence: r.confidence,
        }));
      const incoming = pathRels
        .filter((r) => r.targetId === entity.id)
        .map((r) => ({
          type: r.type,
          fromEntityId: r.sourceId,
          fromEntityName: entityMap.get(r.sourceId)?.name ?? "unknown",
          confidence: r.confidence,
        }));

      const timestamp = getEntityTimestamp(entity);
      steps.push({
        sequenceNumber: i,
        entityId: entity.id,
        entityName: entity.name,
        entityType: entity.entityType,
        timestamp,
        location: getEntityLocation(entity),
        description: getEntityDescription(entity),
        incomingRelationships: incoming,
        outgoingRelationships: outgoing,
        confidence:
          outgoing.length > 0
            ? outgoing.reduce((sum, r) => sum + r.confidence, 0) / outgoing.length
            : entity.confidence,
      });
    }

    const totalConfidence =
      steps.length > 0 ? steps.reduce((sum, s) => sum + s.confidence, 0) / steps.length : 0;

    return {
      chainId: randomUUID(),
      seedEntityId: fromEntityId,
      seedEntityName: seedEntity?.name ?? "unknown",
      steps,
      totalConfidence,
      chainType: "causal",
      createdAt: now,
      metadata: {},
    };
  }

  async saveChain(chain: EventChain): Promise<string> {
    const session = this.getSession();
    try {
      const chainResult = await session.run(
        `CREATE (c:EventChain {
          chainId: $chainId,
          seedEntityId: $seedEntityId,
          seedEntityName: $seedEntityName,
          totalConfidence: $totalConfidence,
          chainType: $chainType,
          createdAt: $createdAt,
          metadata: $metadata
        })
        RETURN c.chainId AS chainId`,
        {
          chainId: chain.chainId,
          seedEntityId: chain.seedEntityId,
          seedEntityName: chain.seedEntityName,
          totalConfidence: chain.totalConfidence,
          chainType: chain.chainType,
          createdAt: chain.createdAt,
          metadata: JSON.stringify(chain.metadata),
        },
      );

      const chainId = chainResult.records[0]?.get("chainId") as string;

      for (const step of chain.steps) {
        await session.run(
          `MATCH (c:EventChain { chainId: $chainId }), (e { id: $entityId })
           CREATE (c)-[r:HAS_STEP {
             sequenceNumber: $sequenceNumber,
             confidence: $confidence,
             description: $description
           }]->(e)`,
          {
            chainId,
            entityId: step.entityId,
            sequenceNumber: step.sequenceNumber,
            confidence: step.confidence,
            description: step.description ?? null,
          },
        );
      }

      return chainId;
    } finally {
      await session.close();
    }
  }

  async getChain(chainId: string): Promise<EventChain | null> {
    const session = this.getSession();
    try {
      const chainResult = await session.run(
        `MATCH (c:EventChain { chainId: $chainId })
         RETURN c`,
        { chainId },
      );

      if (chainResult.records.length === 0) {
        return null;
      }

      const chainNode = chainResult.records[0].get("c");
      const chainProps = chainNode.properties;

      const stepsResult = await session.run(
        `MATCH (c:EventChain { chainId: $chainId })-[r:HAS_STEP]->(e)
         RETURN r, e
         ORDER BY r.sequenceNumber`,
        { chainId },
      );

      const steps: EventChainStep[] = [];

      for (const record of stepsResult.records) {
        const relProps = record.get("r").properties;
        const entityNode = record.get("e");
        const entityProps = entityNode.properties;

        const entityId = entityNode.identity.toString();
        const entity: GraphEntity = {
          id: entityId,
          entityType: entityProps.entityType ?? entityNode.labels?.[0] ?? "Object",
          name: entityProps.name ?? "",
          properties: (entityProps.properties ?? {}) as Record<string, unknown>,
          sourceId: entityProps.sourceId ?? undefined,
          confidence: entityProps.confidence ?? 1,
          createdAt: entityProps.createdAt ?? new Date().toISOString(),
        };

        steps.push({
          sequenceNumber: relProps.sequenceNumber,
          entityId,
          entityName: entity.name,
          entityType: entity.entityType,
          timestamp: getEntityTimestamp(entity),
          location: getEntityLocation(entity),
          description: relProps.description ?? getEntityDescription(entity),
          incomingRelationships: [],
          outgoingRelationships: [],
          confidence: relProps.confidence ?? entity.confidence,
        });
      }

      const parsedMetadata = (() => {
        const m = chainProps.metadata;
        if (typeof m === "string") {
          try {
            return JSON.parse(m);
          } catch {
            return {};
          }
        }
        return m ?? {};
      })();

      return {
        chainId: chainProps.chainId,
        seedEntityId: chainProps.seedEntityId,
        seedEntityName: chainProps.seedEntityName,
        steps,
        totalConfidence: chainProps.totalConfidence,
        chainType: chainProps.chainType,
        createdAt: chainProps.createdAt,
        metadata: parsedMetadata as Record<string, unknown>,
      };
    } finally {
      await session.close();
    }
  }

  async deleteChain(chainId: string): Promise<boolean> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `MATCH (c:EventChain { chainId: $chainId })
         DETACH DELETE c
         RETURN count(c) AS deleted`,
        { chainId },
      );

      const deleted = result.records[0]?.get("deleted")?.toNumber() ?? 0;
      return deleted > 0;
    } finally {
      await session.close();
    }
  }
}
