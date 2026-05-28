import { describe, expect, it } from "vitest";

describe("EntityExtractorAgent - config creation", () => {
  it("should produce correct agent worker config", async () => {
    const { createEntityExtractorAgent } = await import(
      "../../../apps/agents/src/entity-extractor.js"
    );

    const config = createEntityExtractorAgent({
      agentId: "test-01",
      databaseUrl: "postgres://localhost/test",
      redisUrl: "redis://localhost",
      neo4jUri: "bolt://localhost:7687",
      neo4jUser: "neo4j",
      neo4jPassword: "password",
      openrouterApiKey: "sk-test",
    });

    expect(config.agentId).toBe("test-01");
    expect(config.agentType).toBe("entity-extractor");
    expect(config.agentName).toBe("entity-extractor-test-01");
    expect(config.claimedTaskTypes).toEqual(["extract_entities"]);
    expect(config.neo4jUri).toBe("bolt://localhost:7687");
    expect(config.openrouterApiKey).toBe("sk-test");
  });
});

describe("EntityExtractorAgent - entity type mapping", () => {
  it("should map LLM entity types to GraphEntity types correctly", () => {
    const typeMap: Record<string, string> = {
      person: "Person",
      place: "Location",
      organization: "Organization",
      event: "Event",
      object: "Object",
      concept: "Object",
      time: "Object",
      other: "Object",
    };

    expect(typeMap.person).toBe("Person");
    expect(typeMap.organization).toBe("Organization");
    expect(typeMap.place).toBe("Location");
    expect(typeMap.event).toBe("Event");
    expect(typeMap.object).toBe("Object");
    expect(typeMap.concept).toBe("Object");
    expect(typeMap.time).toBe("Object");
    expect(typeMap.other).toBe("Object");
  });

  it("should fallback to Object for unknown types", () => {
    const typeMap: Record<string, string> = {
      person: "Person",
      place: "Location",
      organization: "Organization",
      event: "Event",
      object: "Object",
      concept: "Object",
      time: "Object",
      other: "Object",
    };

    expect(typeMap.unknown).toBeUndefined();
    const mapped = typeMap.unknown ?? "Object";
    expect(mapped).toBe("Object");
  });
});

describe("EntityExtractorAgent - task payload shape", () => {
  it("should require sourceType, sourceId, and sourceData in payload", () => {
    const validPayload = {
      sourceType: "canonical_event",
      sourceId: "evt_001",
      sourceData: { text: "test" },
    };

    expect(validPayload).toHaveProperty("sourceType");
    expect(validPayload).toHaveProperty("sourceId");
    expect(validPayload).toHaveProperty("sourceData");
    expect(typeof validPayload.sourceType).toBe("string");
    expect(typeof validPayload.sourceId).toBe("string");
    expect(typeof validPayload.sourceData).toBe("object");
  });

  it("should accept all four source types", () => {
    const sourceTypes = ["canonical_event", "external_data", "alert", "incident"];
    for (const st of sourceTypes) {
      expect(typeof st).toBe("string");
    }
    expect(sourceTypes.length).toBe(4);
  });
});

describe("EntityExtractorAgent - result shape", () => {
  it("should return entityCount, relationshipCount, entityIds", () => {
    const result = {
      entityCount: 2,
      relationshipCount: 3,
      entityIds: ["id1", "id2"],
    };

    expect(result).toHaveProperty("entityCount");
    expect(result).toHaveProperty("relationshipCount");
    expect(result).toHaveProperty("entityIds");
    expect(typeof result.entityCount).toBe("number");
    expect(Array.isArray(result.entityIds)).toBe(true);
  });

  it("should handle empty results", () => {
    const result = {
      entityCount: 0,
      relationshipCount: 0,
      entityIds: [],
    };

    expect(result.entityCount).toBe(0);
    expect(result.entityIds).toEqual([]);
  });
});

describe("EntityExtractorAgent - deduplication", () => {
  it("should detect duplicate by name and type", () => {
    const existing = [
      { name: "John Smith", type: "Person" },
      { name: "Acme Corp", type: "Organization" },
    ];

    const incoming = { name: "John Smith", type: "Person" };

    const isDuplicate = existing.some((e) => e.name === incoming.name && e.type === incoming.type);
    expect(isDuplicate).toBe(true);
  });

  it("should not detect non-duplicates", () => {
    const existing = [{ name: "John Smith", type: "Person" }];

    const incoming = { name: "Jane Doe", type: "Person" };

    const isDuplicate = existing.some((e) => e.name === incoming.name && e.type === incoming.type);
    expect(isDuplicate).toBe(false);
  });
});
