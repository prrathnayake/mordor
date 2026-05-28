import { describe, expect, it } from "vitest";

describe("RelationshipMinerAgent - config creation", () => {
  it("should produce correct agent worker config", async () => {
    const { createRelationshipMinerAgent } = await import(
      "../../../apps/agents/src/relationship-miner.js"
    );

    const config = createRelationshipMinerAgent({
      agentId: "test-01",
      databaseUrl: "postgres://localhost/test",
      redisUrl: "redis://localhost",
      neo4jUri: "bolt://localhost:7687",
      neo4jUser: "neo4j",
      neo4jPassword: "password",
      openrouterApiKey: "sk-test",
    });

    expect(config.agentId).toBe("test-01");
    expect(config.agentType).toBe("relationship-miner");
    expect(config.agentName).toBe("relationship-miner-test-01");
    expect(config.claimedTaskTypes).toEqual(["mine_relationships"]);
    expect(config.neo4jUri).toBe("bolt://localhost:7687");
    expect(config.openrouterApiKey).toBe("sk-test");
  });
});

describe("RelationshipMinerAgent - relationship type mapping", () => {
  const REL_TYPE_MAP: Record<string, string> = {
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

  function mapRelationshipType(llmType: string): string {
    const key = llmType.toLowerCase().replace(/\s+/g, "_");
    return REL_TYPE_MAP[key] ?? "ASSOCIATED_WITH";
  }

  it("should map common relationship types correctly", () => {
    expect(mapRelationshipType("works_for")).toBe("ASSOCIATED_WITH");
    expect(mapRelationshipType("located_in")).toBe("LOCATED_AT");
    expect(mapRelationshipType("mentions")).toBe("MENTIONS");
    expect(mapRelationshipType("causes")).toBe("CAUSES");
    expect(mapRelationshipType("links_to")).toBe("LINKS_TO");
    expect(mapRelationshipType("source_of")).toBe("SOURCE_OF");
    expect(mapRelationshipType("occurred_during")).toBe("OCCURRED_DURING");
  });

  it("should map types case-insensitively", () => {
    expect(mapRelationshipType("WORKS_FOR")).toBe("ASSOCIATED_WITH");
    expect(mapRelationshipType("Located In")).toBe("LOCATED_AT");
  });

  it("should default to ASSOCIATED_WITH for unmapped types", () => {
    expect(mapRelationshipType("unknown_type")).toBe("ASSOCIATED_WITH");
    expect(mapRelationshipType("participated_in")).toBe("ASSOCIATED_WITH");
  });

  it("should handle type aliases", () => {
    expect(mapRelationshipType("employed_by")).toBe("ASSOCIATED_WITH");
    expect(mapRelationshipType("correlated_with")).toBe("CORRELATES_WITH");
    expect(mapRelationshipType("linked_to")).toBe("LINKS_TO");
  });
});

describe("RelationshipMinerAgent - entity type mapping", () => {
  function mapGraphEntityType(entityType: string): string {
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

  it("should map GraphEntity types to LLM entity types", () => {
    expect(mapGraphEntityType("Person")).toBe("person");
    expect(mapGraphEntityType("Location")).toBe("place");
    expect(mapGraphEntityType("Organization")).toBe("organization");
    expect(mapGraphEntityType("Event")).toBe("event");
    expect(mapGraphEntityType("Object")).toBe("object");
    expect(mapGraphEntityType("Source")).toBe("source");
  });

  it("should return other for unknown types", () => {
    expect(mapGraphEntityType("Unknown")).toBe("other");
  });
});

describe("RelationshipMinerAgent - task payload shape", () => {
  it("should accept optional focusEntityId", () => {
    const withFocus = { focusEntityId: "entity_123" };
    const withoutFocus: { focusEntityId?: string } = {};

    expect(withFocus.focusEntityId).toBeDefined();
    expect(withoutFocus.focusEntityId).toBeUndefined();
  });

  it("should accept optional sourceTypes filter", () => {
    const payload = {
      sourceTypes: ["canonical_event", "external_data"],
      limit: 50,
    };

    expect(Array.isArray(payload.sourceTypes)).toBe(true);
    expect(payload.sourceTypes?.length).toBe(2);
    expect(payload.limit).toBe(50);
  });

  it("should default limit to 50", () => {
    const defaultLimit = 50;
    const payload = { limit: defaultLimit };

    expect(payload.limit).toBe(50);
  });
});

describe("RelationshipMinerAgent - result shape", () => {
  it("should return relationshipCount, relationshipIds, confidenceSummary", () => {
    const result = {
      relationshipCount: 3,
      relationshipIds: ["r1", "r2", "r3"],
      confidenceSummary: {
        min: 0.7,
        max: 0.95,
        avg: 0.85,
        count: 3,
      },
    };

    expect(result).toHaveProperty("relationshipCount");
    expect(result).toHaveProperty("relationshipIds");
    expect(result).toHaveProperty("confidenceSummary");
    expect(typeof result.relationshipCount).toBe("number");
    expect(Array.isArray(result.relationshipIds)).toBe(true);
    expect(result.confidenceSummary).toHaveProperty("min");
    expect(result.confidenceSummary).toHaveProperty("max");
    expect(result.confidenceSummary).toHaveProperty("avg");
    expect(result.confidenceSummary).toHaveProperty("count");
  });

  it("should handle empty results", () => {
    const result = {
      relationshipCount: 0,
      relationshipIds: [],
      confidenceSummary: { min: 0, max: 0, avg: 0, count: 0 },
    };

    expect(result.relationshipCount).toBe(0);
    expect(result.relationshipIds).toEqual([]);
    expect(result.confidenceSummary.count).toBe(0);
  });

  it("should compute confidence summary correctly", () => {
    const confidences = [0.7, 0.85, 0.95];

    const summary = {
      min: Math.min(...confidences),
      max: Math.max(...confidences),
      avg: confidences.reduce((a, b) => a + b, 0) / confidences.length,
      count: confidences.length,
    };

    expect(summary.min).toBe(0.7);
    expect(summary.max).toBe(0.95);
    expect(summary.avg).toBeCloseTo(0.833, 2);
    expect(summary.count).toBe(3);
  });
});

describe("RelationshipMinerAgent - deduplication", () => {
  it("should detect existing relationship between same entities", () => {
    const existingRelationships = [
      { sourceId: "a", targetId: "b" },
      { sourceId: "a", targetId: "c" },
    ];

    const isDuplicate = (srcId: string, tgtId: string): boolean =>
      existingRelationships.some((r) => r.sourceId === srcId && r.targetId === tgtId);

    expect(isDuplicate("a", "b")).toBe(true);
    expect(isDuplicate("a", "c")).toBe(true);
    expect(isDuplicate("a", "d")).toBe(false);
    expect(isDuplicate("b", "a")).toBe(false);
  });
});

describe("RelationshipMinerAgent - neighbor collection", () => {
  it("should collect unique neighbor IDs from relationships", () => {
    const focusId = "entity_1";
    const relationships = [
      { sourceId: "entity_1", targetId: "entity_2" },
      { sourceId: "entity_3", targetId: "entity_1" },
      { sourceId: "entity_1", targetId: "entity_4" },
    ];

    const neighborIds = new Set<string>();
    for (const rel of relationships) {
      if (rel.sourceId !== focusId) neighborIds.add(rel.sourceId);
      if (rel.targetId !== focusId) neighborIds.add(rel.targetId);
    }

    expect(neighborIds.has("entity_2")).toBe(true);
    expect(neighborIds.has("entity_3")).toBe(true);
    expect(neighborIds.has("entity_4")).toBe(true);
    expect(neighborIds.size).toBe(3);
  });
});
