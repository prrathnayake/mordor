import type { Driver, Session } from "neo4j-driver";
import type { GraphEntity } from "./entity-repository.js";
import type { GraphRelationship, RelationshipDirection } from "./relationship-repository.js";

function toInteger(value: number): {
  toNumber: () => number;
  toString: () => string;
  low: number;
  high: number;
} {
  return { toNumber: () => value, toString: () => String(value), low: value, high: 0 };
}

function makeParams(entityId: string): Record<string, unknown> {
  const internalId = Number.parseInt(entityId, 10);
  if (Number.isNaN(internalId)) {
    return { entityId };
  }
  return { entityId: toInteger(internalId) };
}

function nodeToEntity(record: Record<string, unknown>, alias: string = "n"): GraphEntity {
  const obj = record as Record<string, Record<string, unknown>>;
  const node = obj[alias] as
    | { identity: { toString(): string }; labels: string[]; properties: Record<string, unknown> }
    | undefined;
  if (!node) {
    return {
      id: "",
      entityType: "Object",
      name: "",
      properties: {},
      confidence: 1,
      createdAt: new Date().toISOString(),
    };
  }
  const props = node.properties ?? {};
  return {
    id: node.identity.toString(),
    entityType: (props.entityType ?? node.labels?.[0] ?? "Object") as GraphEntity["entityType"],
    name: (props.name ?? "") as string,
    properties: (props.properties ?? {}) as Record<string, unknown>,
    sourceId: (props.sourceId ?? undefined) as string | undefined,
    confidence: (props.confidence ?? 1) as number,
    createdAt: (props.createdAt ?? new Date().toISOString()) as string,
  };
}

export class GraphTraversal {
  private driver: Driver;

  constructor(driver: Driver) {
    this.driver = driver;
  }

  private getSession(): Session {
    return this.driver.session();
  }

  async getSubgraph(
    entityId: string,
    depth: number = 2,
  ): Promise<{ entities: GraphEntity[]; relationships: GraphRelationship[] }> {
    const session = this.getSession();
    try {
      const internalId = Number.parseInt(entityId, 10);
      const idCondition = Number.isNaN(internalId) ? "n.id = $entityId" : "id(n) = $entityId";

      const query = `
        MATCH path = (n)-[*0..${depth}]-(connected)
        WHERE ${idCondition}
        RETURN path
      `;

      const result = await session.run(query, makeParams(entityId));

      const entityMap = new Map<string, GraphEntity>();
      const relMap = new Map<string, GraphRelationship>();

      for (const record of result.records) {
        const path = record.get("path");
        const segments: Array<{
          start: {
            identity: { toString(): string };
            labels: string[];
            properties: Record<string, unknown>;
          };
          end: {
            identity: { toString(): string };
            labels: string[];
            properties: Record<string, unknown>;
          };
          relationship: {
            identity: { toString(): string };
            type: string;
            properties: Record<string, unknown>;
          } | null;
        }> = path.segments ?? [];

        for (const seg of segments) {
          if (seg.relationship) {
            const relId = seg.relationship.identity.toString();
            if (!relMap.has(relId)) {
              const relProps = seg.relationship.properties ?? {};
              relMap.set(relId, {
                id: relId,
                type: seg.relationship.type as GraphRelationship["type"],
                sourceId: seg.start.identity.toString(),
                targetId: seg.end.identity.toString(),
                properties: (relProps.properties ?? {}) as Record<string, unknown>,
                confidence: (relProps.confidence ?? 1) as number,
                createdAt: (relProps.createdAt ?? new Date().toISOString()) as string,
              });
            }
          }

          for (const node of [seg.start, seg.end]) {
            const id = node.identity.toString();
            if (!entityMap.has(id)) {
              const props = node.properties ?? {};
              entityMap.set(id, {
                id,
                entityType: (props.entityType ??
                  node.labels?.[0] ??
                  "Object") as GraphEntity["entityType"],
                name: (props.name ?? "") as string,
                properties: (props.properties ?? {}) as Record<string, unknown>,
                sourceId: (props.sourceId ?? undefined) as string | undefined,
                confidence: (props.confidence ?? 1) as number,
                createdAt: (props.createdAt ?? new Date().toISOString()) as string,
              });
            }
          }
        }
      }

      return {
        entities: Array.from(entityMap.values()),
        relationships: Array.from(relMap.values()),
      };
    } finally {
      await session.close();
    }
  }

  async findConnectedEntities(
    entityId: string,
    relationshipTypes: string[] = [],
    direction: RelationshipDirection = "both",
  ): Promise<GraphEntity[]> {
    const session = this.getSession();
    try {
      const typeFilter = relationshipTypes.length > 0 ? `:${relationshipTypes.join("|")}` : "";

      const directionPattern =
        direction === "outgoing"
          ? `(n)-[r${typeFilter}]->(connected)`
          : direction === "incoming"
            ? `(n)<-[r${typeFilter}]-(connected)`
            : `(n)-[r${typeFilter}]-(connected)`;

      const internalId = Number.parseInt(entityId, 10);
      const idCondition = Number.isNaN(internalId) ? "n.id = $entityId" : "id(n) = $entityId";

      const query = `
        MATCH ${directionPattern}
        WHERE ${idCondition}
        RETURN DISTINCT connected
      `;

      const result = await session.run(query, makeParams(entityId));
      return result.records.map((record) =>
        nodeToEntity(record as unknown as Record<string, unknown>, "connected"),
      );
    } finally {
      await session.close();
    }
  }

  async searchByProperty(
    entityType: string,
    propertyKey: string,
    propertyValue: string,
    limit: number = 50,
  ): Promise<GraphEntity[]> {
    const session = this.getSession();
    try {
      const query = `
        MATCH (n:${entityType})
        WHERE n[$propertyKey] CONTAINS $propertyValue
        RETURN id(n) AS identity, labels(n) AS labels, n
        LIMIT $limit
      `;

      const result = await session.run(query, {
        propertyKey,
        propertyValue,
        limit: toInteger(limit),
      });

      return result.records.map((record) => ({
        id: record.get("identity").toString(),
        entityType: (record.get("n").properties.entityType ??
          record.get("labels")[0] ??
          "Object") as GraphEntity["entityType"],
        name: record.get("n").properties.name ?? "",
        properties: (record.get("n").properties.properties ?? {}) as Record<string, unknown>,
        sourceId: record.get("n").properties.sourceId ?? undefined,
        confidence: record.get("n").properties.confidence ?? 1,
        createdAt: record.get("n").properties.createdAt ?? new Date().toISOString(),
      }));
    } finally {
      await session.close();
    }
  }
}
