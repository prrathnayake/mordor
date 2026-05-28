import type { IncomingMessage, ServerResponse } from "node:http";
import {
  EntityRepository,
  EventChainBuilder,
  GraphTraversal,
  getOrCreateDriver,
  RelationshipRepository,
} from "../../../packages/graph/src/index.js";
import type { Logger } from "../../../packages/logging/src/index.js";

function writeJson(res: ServerResponse, code: number, data: unknown): void {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

const FORBIDDEN_CYPHER_PATTERNS = [
  /^\s*(CREATE|MERGE|SET|DELETE|REMOVE|DROP|ALTER|LOAD|CALL\s+\w+\.\w+\.)/i,
];

function isReadOnlyQuery(query: string): boolean {
  return !FORBIDDEN_CYPHER_PATTERNS.some((pattern) => pattern.test(query.trim()));
}

export function registerGraphRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  authContext: { isAuthenticated: boolean; user: { role: string } | null },
  config: { authEnabled: boolean },
  logger: Logger,
): boolean {
  const method = request.method ?? "GET";
  const pathname = url.pathname;

  if (!pathname.startsWith("/graph/")) {
    return false;
  }

  const driver = getOrCreateDriver();
  const entities = new EntityRepository(driver);
  const relationships = new RelationshipRepository(driver);
  const traversal = new GraphTraversal(driver);
  const chainBuilder = new EventChainBuilder(driver, entities, relationships, traversal);

  if (config.authEnabled && !authContext.isAuthenticated) {
    writeJson(response, 401, { error: "unauthorized" });
    return true;
  }

  try {
    if (method === "GET" && pathname === "/graph/entities") {
      const type = url.searchParams.get("type") ?? undefined;
      const query = url.searchParams.get("query") ?? undefined;
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;

      entities.findEntities({ type, query, limit }).then(
        (results) => writeJson(response, 200, results),
        (err) => {
          logger.error("Graph find entities error", { error: String(err) });
          writeJson(response, 500, { error: "internal_error", message: String(err) });
        },
      );
      return true;
    }

    if (method === "POST" && pathname === "/graph/entities") {
      readJsonBody(request).then(
        (body) => {
          const { entityType, name, properties, sourceId, confidence, createdAt } = body as Record<
            string,
            unknown
          >;
          if (!entityType || !name) {
            writeJson(response, 400, { error: "entityType and name are required" });
            return;
          }
          entities
            .createEntity({
              entityType: entityType as
                | "Source"
                | "Object"
                | "Event"
                | "Location"
                | "Person"
                | "Organization"
                | "Article"
                | "Alert"
                | "Incident"
                | "Layer",
              name: name as string,
              properties: (properties ?? {}) as Record<string, unknown>,
              sourceId: sourceId as string | undefined,
              confidence: (confidence as number) ?? 1,
              createdAt: createdAt as string | undefined,
            })
            .then(
              (result) => writeJson(response, 201, result),
              (err) => {
                logger.error("Graph create entity error", { error: String(err) });
                writeJson(response, 500, { error: "internal_error", message: String(err) });
              },
            );
        },
        () => writeJson(response, 400, { error: "invalid_json" }),
      );
      return true;
    }

    if (method === "GET" && pathname.match(/^\/graph\/entities\/[^/]+\/relationships$/)) {
      const entityId = pathname.split("/")[3];
      const direction =
        (url.searchParams.get("direction") as "outgoing" | "incoming" | "both" | null) ?? "both";
      const type = url.searchParams.get("type") ?? undefined;

      relationships.getEntityRelationships(entityId, direction, type).then(
        (results) => writeJson(response, 200, results),
        (err) => {
          logger.error("Graph get relationships error", { error: String(err) });
          writeJson(response, 500, { error: "internal_error", message: String(err) });
        },
      );
      return true;
    }

    if (method === "GET" && pathname.match(/^\/graph\/entities\/[^/]+$/)) {
      const entityId = pathname.replace("/graph/entities/", "");

      entities.getEntityById(entityId).then(
        (result) => {
          if (!result) {
            writeJson(response, 404, { error: "entity not found" });
            return;
          }
          writeJson(response, 200, result);
        },
        (err) => {
          logger.error("Graph get entity error", { error: String(err) });
          writeJson(response, 500, { error: "internal_error", message: String(err) });
        },
      );
      return true;
    }

    if (method === "PUT" && pathname.match(/^\/graph\/entities\/[^/]+$/)) {
      const entityId = pathname.replace("/graph/entities/", "");

      readJsonBody(request).then(
        (body) => {
          entities.updateEntity(entityId, body as Record<string, unknown>).then(
            (result) => writeJson(response, 200, result),
            (err) => {
              if (err instanceof Error && err.message.includes("not found")) {
                writeJson(response, 404, { error: "entity not found" });
                return;
              }
              logger.error("Graph update entity error", { error: String(err) });
              writeJson(response, 500, { error: "internal_error", message: String(err) });
            },
          );
        },
        () => writeJson(response, 400, { error: "invalid_json" }),
      );
      return true;
    }

    if (method === "DELETE" && pathname.match(/^\/graph\/entities\/[^/]+$/)) {
      const entityId = pathname.replace("/graph/entities/", "");

      entities.deleteEntity(entityId).then(
        (deleted) => {
          if (!deleted) {
            writeJson(response, 404, { error: "entity not found" });
            return;
          }
          writeJson(response, 200, { success: true });
        },
        (err) => {
          logger.error("Graph delete entity error", { error: String(err) });
          writeJson(response, 500, { error: "internal_error", message: String(err) });
        },
      );
      return true;
    }

    if (method === "POST" && pathname === "/graph/relationships") {
      readJsonBody(request).then(
        (body) => {
          const { type, sourceId, targetId, properties, confidence, createdAt } = body as Record<
            string,
            unknown
          >;
          if (!type || !sourceId || !targetId) {
            writeJson(response, 400, { error: "type, sourceId, and targetId are required" });
            return;
          }
          relationships
            .createRelationship({
              type: type as
                | "ASSOCIATED_WITH"
                | "LOCATED_AT"
                | "OCCURRED_DURING"
                | "MENTIONS"
                | "CAUSES"
                | "CORRELATES_WITH"
                | "SOURCE_OF"
                | "LINKS_TO",
              sourceId: sourceId as string,
              targetId: targetId as string,
              properties: (properties ?? {}) as Record<string, unknown>,
              confidence: (confidence as number) ?? 1,
              createdAt: createdAt as string | undefined,
            })
            .then(
              (result) => writeJson(response, 201, result),
              (err) => {
                logger.error("Graph create relationship error", { error: String(err) });
                writeJson(response, 500, { error: "internal_error", message: String(err) });
              },
            );
        },
        () => writeJson(response, 400, { error: "invalid_json" }),
      );
      return true;
    }

    if (method === "DELETE" && pathname.match(/^\/graph\/relationships\/[^/]+$/)) {
      const relationshipId = pathname.replace("/graph/relationships/", "");

      relationships.deleteRelationship(relationshipId).then(
        (deleted) => {
          if (!deleted) {
            writeJson(response, 404, { error: "relationship not found" });
            return;
          }
          writeJson(response, 200, { success: true });
        },
        (err) => {
          logger.error("Graph delete relationship error", { error: String(err) });
          writeJson(response, 500, { error: "internal_error", message: String(err) });
        },
      );
      return true;
    }

    if (method === "POST" && pathname === "/graph/query") {
      readJsonBody(request).then(
        (body) => {
          const { cypher, params } = body as { cypher?: string; params?: Record<string, unknown> };

          if (!cypher || typeof cypher !== "string") {
            writeJson(response, 400, { error: "cypher query is required" });
            return;
          }

          if (!isReadOnlyQuery(cypher)) {
            writeJson(response, 400, {
              error: "forbidden_mutation",
              message: "Only read-only Cypher queries are allowed",
            });
            return;
          }

          const querySession = driver.session();
          querySession.run(cypher, params ?? {}).then(
            (result) => {
              querySession.close();
              const records: Array<Record<string, unknown>> = [];
              for (const record of result.records) {
                const obj: Record<string, unknown> = {};
                const keys: string[] = (record as unknown as { keys: string[] }).keys;
                for (const key of keys) {
                  obj[key] = (record as unknown as Record<string, (key: string) => unknown>).get(
                    key,
                  );
                }
                records.push(obj);
              }
              writeJson(response, 200, { records });
            },
            (err: unknown) => {
              querySession.close();
              logger.error("Graph query error", { error: String(err) });
              writeJson(response, 400, { error: "query_error", message: String(err) });
            },
          );
        },
        () => writeJson(response, 400, { error: "invalid_json" }),
      );
      return true;
    }

    if (method === "GET" && pathname.match(/^\/graph\/entity-chains\/[^/]+$/)) {
      const entityId = pathname.replace("/graph/entity-chains/", "");
      const depthParam = url.searchParams.get("depth");
      const depth = depthParam ? Number.parseInt(depthParam, 10) : 3;

      traversal.getSubgraph(entityId, depth).then(
        (result) => writeJson(response, 200, result),
        (err) => {
          logger.error("Graph subgraph error", { error: String(err) });
          writeJson(response, 500, { error: "internal_error", message: String(err) });
        },
      );
      return true;
    }

    // --- Chain routes ---

    if (method === "POST" && pathname.match(/^\/graph\/chains\/from\/[^/]+$/)) {
      const entityId = pathname.replace("/graph/chains/from/", "");
      readJsonBody(request).then(
        (body) => {
          const options: {
            depth?: number;
            chainType?: "causal" | "correlated" | "temporal";
            timeWindowMs?: number;
          } = {};
          if (body.depth !== undefined) options.depth = body.depth as number;
          if (body.chainType !== undefined)
            options.chainType = body.chainType as "causal" | "correlated" | "temporal";
          if (body.timeWindowMs !== undefined) options.timeWindowMs = body.timeWindowMs as number;

          chainBuilder.buildChain(entityId, options).then(
            (chain) => writeJson(response, 201, chain),
            (err) => {
              logger.error("Chain build error", { error: String(err) });
              writeJson(response, 500, { error: "internal_error", message: String(err) });
            },
          );
        },
        () => writeJson(response, 400, { error: "invalid_json" }),
      );
      return true;
    }

    if (method === "GET" && pathname.match(/^\/graph\/chains\/[^/]+\/render$/)) {
      const chainId = pathname.split("/")[4];
      chainBuilder.getChain(chainId).then(
        (chain) => {
          if (!chain) {
            writeJson(response, 404, { error: "chain not found" });
            return;
          }
          const render = {
            chainId: chain.chainId,
            seedEntity: {
              id: chain.seedEntityId,
              name: chain.seedEntityName,
            },
            timeline: chain.steps.map((step) => ({
              sequenceNumber: step.sequenceNumber,
              entityId: step.entityId,
              entityName: step.entityName,
              entityType: step.entityType,
              timestamp: step.timestamp,
              location: step.location,
              description: step.description,
              causeLabel:
                step.incomingRelationships.length > 0
                  ? `Caused by ${step.incomingRelationships[0].fromEntityName}`
                  : undefined,
              effectLabel:
                step.outgoingRelationships.length > 0
                  ? `Causes ${step.outgoingRelationships[0].toEntityName}`
                  : undefined,
            })),
            totalConfidence: chain.totalConfidence,
            chainType: chain.chainType,
          };
          writeJson(response, 200, render);
        },
        (err) => {
          logger.error("Chain render error", { error: String(err) });
          writeJson(response, 500, { error: "internal_error", message: String(err) });
        },
      );
      return true;
    }

    if (method === "GET" && pathname.match(/^\/graph\/chains\/[^/]+$/)) {
      const chainId = pathname.replace("/graph/chains/", "");
      chainBuilder.getChain(chainId).then(
        (chain) => {
          if (!chain) {
            writeJson(response, 404, { error: "chain not found" });
            return;
          }
          writeJson(response, 200, chain);
        },
        (err) => {
          logger.error("Chain get error", { error: String(err) });
          writeJson(response, 500, { error: "internal_error", message: String(err) });
        },
      );
      return true;
    }

    if (method === "DELETE" && pathname.match(/^\/graph\/chains\/[^/]+$/)) {
      const chainId = pathname.replace("/graph/chains/", "");
      chainBuilder.deleteChain(chainId).then(
        (deleted) => {
          if (!deleted) {
            writeJson(response, 404, { error: "chain not found" });
            return;
          }
          writeJson(response, 200, { success: true });
        },
        (err) => {
          logger.error("Chain delete error", { error: String(err) });
          writeJson(response, 500, { error: "internal_error", message: String(err) });
        },
      );
      return true;
    }

    if (method === "POST" && pathname === "/graph/chains/causal-path") {
      readJsonBody(request).then(
        (body) => {
          const { fromEntityId, toEntityId, maxDepth } = body as Record<string, unknown>;
          if (!fromEntityId || !toEntityId) {
            writeJson(response, 400, { error: "fromEntityId and toEntityId are required" });
            return;
          }
          chainBuilder
            .findCausalPath(
              fromEntityId as string,
              toEntityId as string,
              (maxDepth as number) ?? 10,
            )
            .then(
              (chain) => {
                if (!chain) {
                  writeJson(response, 404, { error: "no causal path found" });
                  return;
                }
                writeJson(response, 200, chain);
              },
              (err) => {
                logger.error("Causal path error", { error: String(err) });
                writeJson(response, 500, { error: "internal_error", message: String(err) });
              },
            );
        },
        () => writeJson(response, 400, { error: "invalid_json" }),
      );
      return true;
    }

    writeJson(response, 404, { error: "graph route not found" });
    return true;
  } catch (error) {
    logger.error("Graph route error", { error: String(error) });
    writeJson(response, 500, { error: "internal_error", message: String(error) });
    return true;
  }
}
