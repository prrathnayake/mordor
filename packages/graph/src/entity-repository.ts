import type { Driver, Session } from "neo4j-driver";

function integerParam(value: number): {
  toNumber(): number;
  toString(): string;
  low: number;
  high: number;
} {
  return { toNumber: () => value, toString: () => String(value), low: value, high: 0 };
}

export interface GraphEntity {
  id: string;
  entityType:
    | "Source"
    | "Object"
    | "Event"
    | "Location"
    | "Person"
    | "Organization"
    | "Article"
    | "Alert"
    | "Incident"
    | "Layer";
  name: string;
  properties: Record<string, unknown>;
  sourceId?: string;
  confidence: number;
  createdAt: string;
}

export interface FindEntitiesParams {
  type?: string;
  query?: string;
  limit?: number;
}

function _mapNodeToEntity(record: Record<string, unknown>): GraphEntity {
  const node = record as unknown as {
    identity: { toString(): string };
    labels: string[];
    properties: Record<string, unknown>;
  };
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

export class EntityRepository {
  private driver: Driver;

  constructor(driver: Driver) {
    this.driver = driver;
  }

  private getSession(): Session {
    return this.driver.session();
  }

  async createEntity(
    entity: Omit<GraphEntity, "id" | "createdAt"> & { createdAt?: string },
  ): Promise<GraphEntity> {
    const session = this.getSession();
    try {
      const createdAt = entity.createdAt ?? new Date().toISOString();
      const labels = entity.entityType;
      const result = await session.run(
        `CREATE (n:${labels} {
          id: randomUUID(),
          entityType: $entityType,
          name: $name,
          properties: $properties,
          sourceId: $sourceId,
          confidence: $confidence,
          createdAt: $createdAt
        })
        RETURN id(n) AS identity, labels(n) AS labels, n`,
        {
          entityType: entity.entityType,
          name: entity.name,
          properties: JSON.stringify(entity.properties ?? {}),
          sourceId: entity.sourceId ?? null,
          confidence: entity.confidence ?? 1,
          createdAt,
        },
      );

      if (result.records.length === 0) {
        throw new Error("Failed to create entity");
      }

      const record = result.records[0];
      return {
        id: record.get("identity").toString(),
        entityType: entity.entityType,
        name: entity.name,
        properties: entity.properties ?? {},
        sourceId: entity.sourceId,
        confidence: entity.confidence ?? 1,
        createdAt,
      };
    } finally {
      await session.close();
    }
  }

  async getEntityById(id: string): Promise<GraphEntity | null> {
    const session = this.getSession();
    try {
      const internalId = Number.parseInt(id, 10);
      if (Number.isNaN(internalId)) {
        const result = await session.run(
          "MATCH (n) WHERE n.id = $id RETURN id(n) AS identity, labels(n) AS labels, n",
          { id },
        );
        if (result.records.length === 0) return null;
        const record = result.records[0];
        return {
          id: record.get("identity").toString(),
          entityType: (record.get("n").properties.entityType ??
            record.get("labels")[0] ??
            "Object") as GraphEntity["entityType"],
          name: record.get("n").properties.name ?? "",
          properties: (record.get("n").properties.properties ?? {}) as Record<string, unknown>,
          sourceId: record.get("n").properties.sourceId ?? undefined,
          confidence: record.get("n").properties.confidence ?? 1,
          createdAt: record.get("n").properties.createdAt ?? new Date().toISOString(),
        };
      }

      const result = await session.run(
        "MATCH (n) WHERE id(n) = $id RETURN id(n) AS identity, labels(n) AS labels, n",
        { id: integerParam(internalId) },
      );

      if (result.records.length === 0) return null;

      const record = result.records[0];
      return {
        id: record.get("identity").toString(),
        entityType: (record.get("n").properties.entityType ??
          record.get("labels")[0] ??
          "Object") as GraphEntity["entityType"],
        name: record.get("n").properties.name ?? "",
        properties: (record.get("n").properties.properties ?? {}) as Record<string, unknown>,
        sourceId: record.get("n").properties.sourceId ?? undefined,
        confidence: record.get("n").properties.confidence ?? 1,
        createdAt: record.get("n").properties.createdAt ?? new Date().toISOString(),
      };
    } finally {
      await session.close();
    }
  }

  async findEntities(params: FindEntitiesParams): Promise<GraphEntity[]> {
    const session = this.getSession();
    try {
      const limit = params.limit ?? 50;
      let query: string;
      const queryParams: Record<string, unknown> = { limit };

      if (params.type && params.query) {
        query = `
          MATCH (n:${params.type})
          WHERE n.name CONTAINS $query OR toString(n.properties) CONTAINS $query
          RETURN id(n) AS identity, labels(n) AS labels, n
          LIMIT $limit
        `;
        queryParams.query = params.query;
      } else if (params.type) {
        query = `
          MATCH (n:${params.type})
          RETURN id(n) AS identity, labels(n) AS labels, n
          LIMIT $limit
        `;
      } else if (params.query) {
        query = `
          MATCH (n)
          WHERE n.name CONTAINS $query OR toString(n.properties) CONTAINS $query
          RETURN id(n) AS identity, labels(n) AS labels, n
          LIMIT $limit
        `;
        queryParams.query = params.query;
      } else {
        query = `
          MATCH (n)
          RETURN id(n) AS identity, labels(n) AS labels, n
          LIMIT $limit
        `;
      }

      const result = await session.run(query, queryParams);
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

  async deleteEntity(id: string): Promise<boolean> {
    const session = this.getSession();
    try {
      const internalId = Number.parseInt(id, 10);
      if (Number.isNaN(internalId)) {
        const result = await session.run(
          "MATCH (n) WHERE n.id = $id DETACH DELETE n RETURN count(n) AS deleted",
          { id },
        );
        const deleted = result.records[0]?.get("deleted")?.toNumber() ?? 0;
        return deleted > 0;
      }

      const result = await session.run(
        "MATCH (n) WHERE id(n) = $id DETACH DELETE n RETURN count(n) AS deleted",
        { id: integerParam(internalId) },
      );

      const deleted = result.records[0]?.get("deleted")?.toNumber() ?? 0;
      return deleted > 0;
    } finally {
      await session.close();
    }
  }

  async updateEntity(
    id: string,
    partial: Partial<Omit<GraphEntity, "id" | "createdAt">>,
  ): Promise<GraphEntity> {
    const session = this.getSession();
    try {
      const setClauses: string[] = [];
      const params: Record<string, unknown> = {};

      if (partial.entityType !== undefined) {
        setClauses.push("n.entityType = $entityType");
        params.entityType = partial.entityType;
      }
      if (partial.name !== undefined) {
        setClauses.push("n.name = $name");
        params.name = partial.name;
      }
      if (partial.properties !== undefined) {
        setClauses.push("n.properties = $properties");
        params.properties = JSON.stringify(partial.properties);
      }
      if (partial.sourceId !== undefined) {
        setClauses.push("n.sourceId = $sourceId");
        params.sourceId = partial.sourceId;
      }
      if (partial.confidence !== undefined) {
        setClauses.push("n.confidence = $confidence");
        params.confidence = partial.confidence;
      }

      if (setClauses.length === 0) {
        return this.getEntityById(id) as Promise<GraphEntity>;
      }

      const internalId = Number.parseInt(id, 10);
      let result: any; // eslint-disable-line
      if (Number.isNaN(internalId)) {
        result = await session.run(
          `MATCH (n) WHERE n.id = $id SET ${setClauses.join(", ")} RETURN id(n) AS identity, labels(n) AS labels, n`,
          { ...params, id },
        );
      } else {
        result = await session.run(
          `MATCH (n) WHERE id(n) = $id SET ${setClauses.join(", ")} RETURN id(n) AS identity, labels(n) AS labels, n`,
          { ...params, id: integerParam(internalId) },
        );
      }

      if (result.records.length === 0) {
        throw new Error(`Entity with id ${id} not found`);
      }

      const record = result.records[0];
      return {
        id: record.get("identity").toString(),
        entityType: (record.get("n").properties.entityType ??
          record.get("labels")[0] ??
          "Object") as GraphEntity["entityType"],
        name: record.get("n").properties.name ?? "",
        properties: (record.get("n").properties.properties ?? {}) as Record<string, unknown>,
        sourceId: record.get("n").properties.sourceId ?? undefined,
        confidence: record.get("n").properties.confidence ?? 1,
        createdAt: record.get("n").properties.createdAt ?? new Date().toISOString(),
      };
    } finally {
      await session.close();
    }
  }
}
