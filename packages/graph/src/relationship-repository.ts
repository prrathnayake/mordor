import type { Driver, Session } from "neo4j-driver";

function integerParam(value: number): {
  toNumber(): number;
  toString(): string;
  low: number;
  high: number;
} {
  return { toNumber: () => value, toString: () => String(value), low: value, high: 0 };
}

export interface GraphRelationship {
  id: string;
  type:
    | "ASSOCIATED_WITH"
    | "LOCATED_AT"
    | "OCCURRED_DURING"
    | "MENTIONS"
    | "CAUSES"
    | "CORRELATES_WITH"
    | "SOURCE_OF"
    | "LINKS_TO";
  sourceId: string;
  targetId: string;
  properties: Record<string, unknown>;
  confidence: number;
  createdAt: string;
}

export type RelationshipDirection = "outgoing" | "incoming" | "both";

export class RelationshipRepository {
  private driver: Driver;

  constructor(driver: Driver) {
    this.driver = driver;
  }

  private getSession(): Session {
    return this.driver.session();
  }

  async createRelationship(
    rel: Omit<GraphRelationship, "id" | "createdAt"> & { createdAt?: string },
  ): Promise<GraphRelationship> {
    const session = this.getSession();
    try {
      const createdAt = rel.createdAt ?? new Date().toISOString();
      const sourceInternalId = Number.parseInt(rel.sourceId, 10);
      const targetInternalId = Number.parseInt(rel.targetId, 10);

      if (Number.isNaN(sourceInternalId) || Number.isNaN(targetInternalId)) {
        const result = await session.run(
          `MATCH (a), (b)
           WHERE a.id = $sourceId AND b.id = $targetId
           CREATE (a)-[r:${rel.type} {
             id: randomUUID(),
             type: $type,
             properties: $properties,
             confidence: $confidence,
             createdAt: $createdAt
           }]->(b)
           RETURN id(r) AS identity, type(r) AS relType, r`,
          {
            sourceId: rel.sourceId,
            targetId: rel.targetId,
            type: rel.type,
            properties: JSON.stringify(rel.properties ?? {}),
            confidence: rel.confidence ?? 1,
            createdAt,
          },
        );

        if (result.records.length === 0) {
          throw new Error("Failed to create relationship: entities not found");
        }

        const record = result.records[0];
        return {
          id: record.get("identity").toString(),
          type: rel.type,
          sourceId: rel.sourceId,
          targetId: rel.targetId,
          properties: rel.properties ?? {},
          confidence: rel.confidence ?? 1,
          createdAt,
        };
      }

      const result = await session.run(
        `MATCH (a), (b)
         WHERE id(a) = $sourceId AND id(b) = $targetId
         CREATE (a)-[r:${rel.type} {
           id: randomUUID(),
           type: $type,
           properties: $properties,
           confidence: $confidence,
           createdAt: $createdAt
         }]->(b)
         RETURN id(r) AS identity, type(r) AS relType, r`,
        {
          sourceId: integerParam(sourceInternalId),
          targetId: integerParam(targetInternalId),
          type: rel.type,
          properties: JSON.stringify(rel.properties ?? {}),
          confidence: rel.confidence ?? 1,
          createdAt,
        },
      );

      if (result.records.length === 0) {
        throw new Error("Failed to create relationship: entities not found");
      }

      const record = result.records[0];
      return {
        id: record.get("identity").toString(),
        type: rel.type,
        sourceId: rel.sourceId,
        targetId: rel.targetId,
        properties: rel.properties ?? {},
        confidence: rel.confidence ?? 1,
        createdAt,
      };
    } finally {
      await session.close();
    }
  }

  async getEntityRelationships(
    entityId: string,
    direction: RelationshipDirection = "both",
    type?: string,
  ): Promise<GraphRelationship[]> {
    const session = this.getSession();
    try {
      const internalId = Number.parseInt(entityId, 10);
      const typeFilter = type ? `:${type}` : "";
      const directionPattern =
        direction === "outgoing"
          ? `(n)-[r${typeFilter}]->(other)`
          : direction === "incoming"
            ? `(n)<-[r${typeFilter}]-(other)`
            : `(n)-[r${typeFilter}]-(other)`;

      const query = `
        MATCH ${directionPattern}
        WHERE ${Number.isNaN(internalId) ? "n.id = $entityId" : "id(n) = $entityId"}
        RETURN id(r) AS identity, type(r) AS relType, r,
               id(startNode(r)) AS sourceIdentity,
               id(endNode(r)) AS targetIdentity
      `;

      const params: Record<string, unknown> = {};
      if (Number.isNaN(internalId)) {
        params.entityId = entityId;
      } else {
        params.entityId = integerParam(internalId);
      }

      const result = await session.run(query, params);
      return result.records.map((record) => ({
        id: record.get("identity").toString(),
        type: record.get("relType") as GraphRelationship["type"],
        sourceId: record.get("sourceIdentity").toString(),
        targetId: record.get("targetIdentity").toString(),
        properties: (record.get("r").properties?.properties ?? {}) as Record<string, unknown>,
        confidence: record.get("r").properties?.confidence ?? 1,
        createdAt: record.get("r").properties?.createdAt ?? new Date().toISOString(),
      }));
    } finally {
      await session.close();
    }
  }

  async deleteRelationship(id: string): Promise<boolean> {
    const session = this.getSession();
    try {
      const internalId = Number.parseInt(id, 10);
      if (Number.isNaN(internalId)) {
        const result = await session.run(
          "MATCH ()-[r]-() WHERE r.id = $id DELETE r RETURN count(r) AS deleted",
          { id },
        );
        const deleted = result.records[0]?.get("deleted")?.toNumber() ?? 0;
        return deleted > 0;
      }

      const result = await session.run(
        "MATCH ()-[r]-() WHERE id(r) = $id DELETE r RETURN count(r) AS deleted",
        { id: integerParam(internalId) },
      );

      const deleted = result.records[0]?.get("deleted")?.toNumber() ?? 0;
      return deleted > 0;
    } finally {
      await session.close();
    }
  }

  async findPaths(
    sourceId: string,
    targetId: string,
    maxDepth: number = 5,
  ): Promise<GraphRelationship[][]> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `
        MATCH path = shortestPath((a)-[*1..${maxDepth}]-(b))
        WHERE ${Number.isNaN(Number.parseInt(sourceId, 10)) ? "a.id = $sourceId" : "id(a) = $sourceId"}
          AND ${Number.isNaN(Number.parseInt(targetId, 10)) ? "b.id = $targetId" : "id(b) = $targetId"}
        RETURN path
        `,
        {
          sourceId: Number.isNaN(Number.parseInt(sourceId, 10))
            ? sourceId
            : integerParam(Number.parseInt(sourceId, 10)),
          targetId: Number.isNaN(Number.parseInt(targetId, 10))
            ? targetId
            : integerParam(Number.parseInt(targetId, 10)),
        },
      );

      return result.records.map((record) => {
        const path = record.get("path");
        const segments: GraphRelationship[] = [];
        for (const segment of path.segments ?? []) {
          segments.push({
            id: segment.relationship.identity.toString(),
            type: segment.relationship.type as GraphRelationship["type"],
            sourceId: segment.start.identity.toString(),
            targetId: segment.end.identity.toString(),
            properties: (segment.relationship.properties?.properties ?? {}) as Record<
              string,
              unknown
            >,
            confidence: segment.relationship.properties?.confidence ?? 1,
            createdAt: segment.relationship.properties?.createdAt ?? new Date().toISOString(),
          });
        }
        return segments;
      });
    } finally {
      await session.close();
    }
  }
}
