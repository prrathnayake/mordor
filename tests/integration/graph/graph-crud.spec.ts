import neo4j from "neo4j-driver";
import { GenericContainer, Wait } from "testcontainers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EntityRepository } from "../../../packages/graph/src/entity-repository.js";
import { GraphTraversal } from "../../../packages/graph/src/graph-traversal.js";
import { RelationshipRepository } from "../../../packages/graph/src/relationship-repository.js";

const NEO4J_IMAGE = "neo4j:5-enterprise";
const NEO4J_USER = "neo4j";
const NEO4J_PASSWORD = "testpassword123";

describe("graph CRUD integration", () => {
  let container: Awaited<ReturnType<GenericContainer["start"]>>;
  let driver: ReturnType<typeof neo4j.driver>;
  let entities: EntityRepository;
  let relationships: RelationshipRepository;
  let traversal: GraphTraversal;

  beforeAll(async () => {
    container = await new GenericContainer(NEO4J_IMAGE)
      .withEnvironment({
        NEO4J_AUTH: `${NEO4J_USER}/${NEO4J_PASSWORD}`,
        NEO4J_ACCEPT_LICENSE_AGREEMENT: "yes",
      })
      .withExposedPorts(7687)
      .withStartupTimeout(120_000)
      .withWaitStrategy(Wait.forLogMessage("Started."))
      .start();

    const uri = `bolt://${container.getHost()}:${container.getMappedPort(7687)}`;
    driver = neo4j.driver(uri, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD), {
      maxConnectionPoolSize: 10,
    });

    entities = new EntityRepository(driver);
    relationships = new RelationshipRepository(driver);
    traversal = new GraphTraversal(driver);
  });

  afterAll(async () => {
    if (driver) {
      await driver.close();
    }
    if (container) {
      await container.stop();
    }
  });

  it("creates an entity and retrieves it by id", async () => {
    const created = await entities.createEntity({
      entityType: "Alert",
      name: "Test Alert",
      properties: { severity: "critical", region: "test" },
      confidence: 0.95,
    });

    expect(created.id).toBeDefined();
    expect(created.name).toBe("Test Alert");
    expect(created.entityType).toBe("Alert");
    expect(created.confidence).toBe(0.95);

    const retrieved = await entities.getEntityById(created.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe("Test Alert");
    expect(retrieved?.entityType).toBe("Alert");
  });

  it("returns null for non-existent entity", async () => {
    const result = await entities.getEntityById("non-existent-id");
    expect(result).toBeNull();
  });

  it("finds entities with type filter", async () => {
    await entities.createEntity({
      entityType: "Object",
      name: "Findable Object",
      properties: { type: "test" },
      confidence: 1,
    });

    const results = await entities.findEntities({ type: "Object", limit: 10 });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((e) => e.name === "Findable Object")).toBe(true);
  });

  it("updates an entity", async () => {
    const created = await entities.createEntity({
      entityType: "Event",
      name: "Original Name",
      properties: {},
      confidence: 0.5,
    });

    const updated = await entities.updateEntity(created.id, {
      name: "Updated Name",
      confidence: 0.99,
    });

    expect(updated.name).toBe("Updated Name");
    expect(updated.confidence).toBe(0.99);
  });

  it("deletes an entity", async () => {
    const created = await entities.createEntity({
      entityType: "Object",
      name: "To Be Deleted",
      properties: {},
      confidence: 1,
    });

    const deleted = await entities.deleteEntity(created.id);
    expect(deleted).toBe(true);

    const retrieved = await entities.getEntityById(created.id);
    expect(retrieved).toBeNull();
  });

  it("returns false when deleting non-existent entity", async () => {
    const result = await entities.deleteEntity("999999");
    expect(result).toBe(false);
  });

  it("creates a relationship between two entities", async () => {
    const source = await entities.createEntity({
      entityType: "Object",
      name: "Source Entity",
      properties: {},
      confidence: 1,
    });
    const target = await entities.createEntity({
      entityType: "Location",
      name: "Target Entity",
      properties: {},
      confidence: 1,
    });

    const rel = await relationships.createRelationship({
      type: "LOCATED_AT",
      sourceId: source.id,
      targetId: target.id,
      properties: { distance_km: 100 },
      confidence: 0.95,
    });

    expect(rel.id).toBeDefined();
    expect(rel.type).toBe("LOCATED_AT");
    expect(rel.sourceId).toBe(source.id);
    expect(rel.targetId).toBe(target.id);
    expect(rel.confidence).toBe(0.95);
  });

  it("gets entity relationships with direction filtering", async () => {
    const a = await entities.createEntity({
      entityType: "Object",
      name: "Entity A",
      properties: {},
      confidence: 1,
    });
    const b = await entities.createEntity({
      entityType: "Object",
      name: "Entity B",
      properties: {},
      confidence: 1,
    });

    await relationships.createRelationship({
      type: "ASSOCIATED_WITH",
      sourceId: a.id,
      targetId: b.id,
      properties: {},
      confidence: 1,
    });

    const outgoing = await relationships.getEntityRelationships(a.id, "outgoing");
    expect(outgoing.length).toBeGreaterThanOrEqual(1);
    expect(outgoing.some((r) => r.targetId === b.id)).toBe(true);

    const incoming = await relationships.getEntityRelationships(b.id, "incoming");
    expect(incoming.length).toBeGreaterThanOrEqual(1);
    expect(incoming.some((r) => r.sourceId === a.id)).toBe(true);

    const both = await relationships.getEntityRelationships(a.id, "both");
    expect(both.length).toBeGreaterThanOrEqual(1);
  });

  it("gets entity relationships with type filtering", async () => {
    const src = await entities.createEntity({
      entityType: "Object",
      name: "Type Filter Source",
      properties: {},
      confidence: 1,
    });
    const tgt = await entities.createEntity({
      entityType: "Object",
      name: "Type Filter Target",
      properties: {},
      confidence: 1,
    });

    await relationships.createRelationship({
      type: "LOCATED_AT",
      sourceId: src.id,
      targetId: tgt.id,
      properties: {},
      confidence: 1,
    });

    const locatedAt = await relationships.getEntityRelationships(src.id, "both", "LOCATED_AT");
    expect(locatedAt.length).toBeGreaterThanOrEqual(1);

    const nonMatching = await relationships.getEntityRelationships(src.id, "both", "CAUSES");
    expect(nonMatching.length).toBe(0);
  });

  it("finds paths between entities", async () => {
    const start = await entities.createEntity({
      entityType: "Object",
      name: "Path Start",
      properties: {},
      confidence: 1,
    });
    const mid = await entities.createEntity({
      entityType: "Object",
      name: "Path Middle",
      properties: {},
      confidence: 1,
    });
    const end = await entities.createEntity({
      entityType: "Object",
      name: "Path End",
      properties: {},
      confidence: 1,
    });

    await relationships.createRelationship({
      type: "ASSOCIATED_WITH",
      sourceId: start.id,
      targetId: mid.id,
      properties: {},
      confidence: 1,
    });
    await relationships.createRelationship({
      type: "ASSOCIATED_WITH",
      sourceId: mid.id,
      targetId: end.id,
      properties: {},
      confidence: 1,
    });

    const paths = await relationships.findPaths(start.id, end.id, 5);
    expect(paths.length).toBeGreaterThanOrEqual(1);
    const firstPath = paths[0];
    expect(firstPath.length).toBeGreaterThanOrEqual(2);
  });

  it("gets subgraph to depth N", async () => {
    const center = await entities.createEntity({
      entityType: "Object",
      name: "Subgraph Center",
      properties: {},
      confidence: 1,
    });
    const neighbor = await entities.createEntity({
      entityType: "Object",
      name: "Subgraph Neighbor",
      properties: {},
      confidence: 1,
    });
    const distant = await entities.createEntity({
      entityType: "Object",
      name: "Subgraph Distant",
      properties: {},
      confidence: 1,
    });

    await relationships.createRelationship({
      type: "ASSOCIATED_WITH",
      sourceId: center.id,
      targetId: neighbor.id,
      properties: {},
      confidence: 1,
    });
    await relationships.createRelationship({
      type: "ASSOCIATED_WITH",
      sourceId: neighbor.id,
      targetId: distant.id,
      properties: {},
      confidence: 1,
    });

    const subgraph = await traversal.getSubgraph(center.id, 2);
    expect(subgraph.entities.length).toBeGreaterThanOrEqual(2);
    expect(subgraph.relationships.length).toBeGreaterThanOrEqual(1);
  });

  it("searches by property", async () => {
    await entities.createEntity({
      entityType: "Source",
      name: "USGS Quake Feed",
      properties: { provider: "USGS", feedType: "earthquake" },
      confidence: 1,
    });

    const results = await traversal.searchByProperty("Source", "provider", "USGS", 10);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((e) => e.name === "USGS Quake Feed")).toBe(true);
  });

  it("deletes a relationship", async () => {
    const src = await entities.createEntity({
      entityType: "Object",
      name: "Rel Delete Source",
      properties: {},
      confidence: 1,
    });
    const tgt = await entities.createEntity({
      entityType: "Object",
      name: "Rel Delete Target",
      properties: {},
      confidence: 1,
    });

    const rel = await relationships.createRelationship({
      type: "LOCATED_AT",
      sourceId: src.id,
      targetId: tgt.id,
      properties: {},
      confidence: 1,
    });

    const deleted = await relationships.deleteRelationship(rel.id);
    expect(deleted).toBe(true);

    const secondDelete = await relationships.deleteRelationship(rel.id);
    expect(secondDelete).toBe(false);
  });
});
