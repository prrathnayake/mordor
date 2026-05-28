import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockSession = {
  run: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
};

const mockDriver = {
  session: vi.fn().mockReturnValue(mockSession),
  close: vi.fn().mockResolvedValue(undefined),
  getServerInfo: vi.fn().mockResolvedValue({ agent: "Neo4j/5.0.0" }),
};

vi.mock("neo4j-driver", () => ({
  default: {
    driver: vi.fn().mockReturnValue(mockDriver),
    auth: {
      basic: vi.fn().mockReturnValue({ type: "basic" }),
    },
    INTEGER: {
      fromValue: (v: number) => ({ toNumber: () => v, toString: () => String(v), low: v, high: 0 }),
    },
  },
  INTEGER: {
    fromValue: (v: number) => ({ toNumber: () => v, toString: () => String(v), low: v, high: 0 }),
  },
  auth: {
    basic: vi.fn().mockReturnValue({ type: "basic" }),
  },
}));

import { EntityRepository } from "../../../packages/graph/src/entity-repository.js";

describe("EntityRepository", () => {
  let repo: EntityRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new EntityRepository(
      mockDriver as unknown as ReturnType<typeof import("neo4j-driver").default.driver>,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("createEntity", () => {
    it("creates an entity and returns it", async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              if (key === "identity") return { toString: () => "1" };
              if (key === "labels") return ["Event"];
              return { properties: { name: "Test Event" } };
            },
          },
        ],
      });

      const result = await repo.createEntity({
        entityType: "Event",
        name: "Test Event",
        properties: { severity: "high" },
        confidence: 0.95,
      });

      expect(result.id).toBe("1");
      expect(result.entityType).toBe("Event");
      expect(result.name).toBe("Test Event");
      expect(mockSession.run).toHaveBeenCalledOnce();
      expect(mockSession.close).toHaveBeenCalledOnce();
    });

    it("throws when no records returned", async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      await expect(
        repo.createEntity({
          entityType: "Event",
          name: "Test",
          properties: {},
          confidence: 1,
        }),
      ).rejects.toThrow("Failed to create entity");
    });
  });

  describe("getEntityById", () => {
    it("returns null when entity not found", async () => {
      mockSession.run.mockResolvedValue({ records: [] });

      const result = await repo.getEntityById("999");

      expect(result).toBeNull();
    });

    it("returns entity when found", async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              if (key === "identity") return { toString: () => "1" };
              if (key === "labels") return ["Object"];
              return {
                properties: {
                  entityType: "Object",
                  name: "Test Object",
                  properties: {},
                  sourceId: "src-1",
                  confidence: 0.8,
                  createdAt: "2025-01-01T00:00:00.000Z",
                },
              };
            },
          },
        ],
      });

      const result = await repo.getEntityById("1");

      expect(result).not.toBeNull();
      expect(result?.id).toBe("1");
      expect(result?.entityType).toBe("Object");
      expect(result?.name).toBe("Test Object");
      expect(result?.sourceId).toBe("src-1");
    });
  });

  describe("findEntities", () => {
    it("returns entities with type filter", async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              if (key === "identity") return { toString: () => "1" };
              if (key === "labels") return ["Person"];
              return {
                properties: {
                  entityType: "Person",
                  name: "John Doe",
                  properties: {},
                  confidence: 1,
                  createdAt: "2025-01-01T00:00:00.000Z",
                },
              };
            },
          },
        ],
      });

      const results = await repo.findEntities({ type: "Person", limit: 10 });

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe("John Doe");
    });
  });

  describe("deleteEntity", () => {
    it("returns true when entity deleted", async () => {
      mockSession.run.mockResolvedValue({
        records: [
          { get: (key: string) => (key === "deleted" ? { toNumber: () => 1 } : undefined) },
        ],
      });

      const result = await repo.deleteEntity("1");

      expect(result).toBe(true);
    });

    it("returns false when no entity deleted", async () => {
      mockSession.run.mockResolvedValue({
        records: [
          { get: (key: string) => (key === "deleted" ? { toNumber: () => 0 } : undefined) },
        ],
      });

      const result = await repo.deleteEntity("999");

      expect(result).toBe(false);
    });
  });

  describe("updateEntity", () => {
    it("updates and returns the entity", async () => {
      mockSession.run.mockResolvedValue({
        records: [
          {
            get: (key: string) => {
              if (key === "identity") return { toString: () => "1" };
              if (key === "labels") return ["Alert"];
              return {
                properties: {
                  entityType: "Alert",
                  name: "Updated Alert",
                  properties: {},
                  confidence: 0.9,
                  createdAt: "2025-01-01T00:00:00.000Z",
                },
              };
            },
          },
        ],
      });

      const result = await repo.updateEntity("1", { name: "Updated Alert", confidence: 0.9 });

      expect(result.name).toBe("Updated Alert");
      expect(result.confidence).toBe(0.9);
    });
  });
});
