import { randomUUID } from "node:crypto";
import type { Driver, Session } from "neo4j-driver";
import type { RelationshipRepository } from "./relationship-repository.js";

export interface CausalLink {
  linkId: string;
  causeEntityId: string;
  effectEntityId: string;
  causalType: "direct" | "indirect" | "contributing" | "correlated";
  confidence: number;
  evidenceIds: string[];
  timeDelta: number;
  description?: string;
  createdAt: string;
}

function toInteger(value: number): {
  toNumber: () => number;
  toString: () => string;
  low: number;
  high: number;
} {
  return { toNumber: () => value, toString: () => String(value), low: value, high: 0 };
}

function makeIdParams(entityId: string): { clause: string; params: Record<string, unknown> } {
  const internalId = Number.parseInt(entityId, 10);
  if (Number.isNaN(internalId)) {
    return { clause: "n.id = $entityId", params: { entityId } };
  }
  return { clause: "id(n) = $entityId", params: { entityId: toInteger(internalId) } };
}

export class CausalLinkRepository {
  constructor(
    private relationshipRepo: RelationshipRepository,
    private driver: Driver,
  ) {}

  private getSession(): Session {
    return this.driver.session();
  }

  async recordCausalLink(link: Omit<CausalLink, "linkId" | "createdAt">): Promise<CausalLink> {
    const now = new Date().toISOString();
    const linkId = randomUUID();

    await this.relationshipRepo.createRelationship({
      type: "CAUSES",
      sourceId: link.causeEntityId,
      targetId: link.effectEntityId,
      properties: {
        causalType: link.causalType,
        causalLinkId: linkId,
        evidenceIds: link.evidenceIds,
        timeDelta: link.timeDelta,
        description: link.description,
      },
      confidence: link.confidence,
      createdAt: now,
    });

    return {
      linkId,
      causeEntityId: link.causeEntityId,
      effectEntityId: link.effectEntityId,
      causalType: link.causalType,
      confidence: link.confidence,
      evidenceIds: link.evidenceIds,
      timeDelta: link.timeDelta,
      description: link.description,
      createdAt: now,
    };
  }

  async getCausalLinks(
    entityId: string,
  ): Promise<{ asCause: CausalLink[]; asEffect: CausalLink[] }> {
    const session = this.getSession();
    try {
      const idInfo = makeIdParams(entityId);

      const outgoingResult = await session.run(
        `MATCH (n)-[r:CAUSES]->(target)
         WHERE ${idInfo.clause}
         RETURN r, target,
                target.id AS targetId,
                target.name AS targetName`,
        idInfo.params,
      );

      const asCause: CausalLink[] = outgoingResult.records.map((record) => {
        const relProps = record.get("r").properties;
        const targetNode = record.get("target");
        return {
          linkId: relProps.causalLinkId ?? relProps.linkId ?? randomUUID(),
          causeEntityId: entityId,
          effectEntityId: (record.get("targetId") as string) ?? targetNode.identity.toString(),
          causalType: relProps.causalType ?? "direct",
          confidence: relProps.confidence ?? 1,
          evidenceIds: Array.isArray(relProps.evidenceIds) ? relProps.evidenceIds : [],
          timeDelta: relProps.timeDelta ?? 0,
          description: relProps.description ?? undefined,
          createdAt: relProps.createdAt ?? new Date().toISOString(),
        };
      });

      const incomingResult = await session.run(
        `MATCH (source)-[r:CAUSES]->(n)
         WHERE ${idInfo.clause}
         RETURN r, source,
                source.id AS sourceId,
                source.name AS sourceName`,
        idInfo.params,
      );

      const asEffect: CausalLink[] = incomingResult.records.map((record) => {
        const relProps = record.get("r").properties;
        const sourceNode = record.get("source");
        return {
          linkId: relProps.causalLinkId ?? relProps.linkId ?? randomUUID(),
          causeEntityId: (record.get("sourceId") as string) ?? sourceNode.identity.toString(),
          effectEntityId: entityId,
          causalType: relProps.causalType ?? "direct",
          confidence: relProps.confidence ?? 1,
          evidenceIds: Array.isArray(relProps.evidenceIds) ? relProps.evidenceIds : [],
          timeDelta: relProps.timeDelta ?? 0,
          description: relProps.description ?? undefined,
          createdAt: relProps.createdAt ?? new Date().toISOString(),
        };
      });

      return { asCause, asEffect };
    } finally {
      await session.close();
    }
  }

  async findRootCauses(
    entityId: string,
    depth: number = 5,
  ): Promise<Array<{ entityId: string; confidence: number; path: string[] }>> {
    const session = this.getSession();
    try {
      const idInfo = makeIdParams(entityId);

      const result = await session.run(
        `MATCH path = (root)-[:CAUSES*1..${depth}]->(n)
         WHERE ${idInfo.clause}
           AND NOT EXISTS {
             MATCH (root)<-[:CAUSES]-()
           }
         RETURN root.id AS rootId, root.name AS rootName,
                length(path) AS pathLength,
                [node IN nodes(path) | coalesce(node.id, toString(id(node)))] AS nodeIds
         ORDER BY pathLength DESC
         LIMIT 20`,
        idInfo.params,
      );

      return result.records.map((record) => {
        const pathLength =
          record.get("pathLength")?.toNumber?.() ?? (record.get("pathLength") as number) ?? 0;
        return {
          entityId: (record.get("rootId") as string) ?? entityId,
          confidence: Math.max(0.1, 1.0 - pathLength * 0.1),
          path: (record.get("nodeIds") as string[]) ?? [],
        };
      });
    } finally {
      await session.close();
    }
  }

  async findImpactEntities(
    entityId: string,
    depth: number = 5,
  ): Promise<Array<{ entityId: string; confidence: number; path: string[] }>> {
    const session = this.getSession();
    try {
      const idInfo = makeIdParams(entityId);

      const result = await session.run(
        `MATCH path = (n)-[:CAUSES*1..${depth}]->(impact)
         WHERE ${idInfo.clause}
           AND NOT EXISTS {
             MATCH (impact)-[:CAUSES]->()
           }
         RETURN impact.id AS impactId, impact.name AS impactName,
                length(path) AS pathLength,
                [node IN nodes(path) | coalesce(node.id, toString(id(node)))] AS nodeIds
         ORDER BY pathLength DESC
         LIMIT 20`,
        idInfo.params,
      );

      return result.records.map((record) => {
        const pathLength =
          record.get("pathLength")?.toNumber?.() ?? (record.get("pathLength") as number) ?? 0;
        return {
          entityId: (record.get("impactId") as string) ?? entityId,
          confidence: Math.max(0.1, 1.0 - pathLength * 0.1),
          path: (record.get("nodeIds") as string[]) ?? [],
        };
      });
    } finally {
      await session.close();
    }
  }
}
