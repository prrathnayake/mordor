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

import type { Driver } from "neo4j-driver";
import { EntityRepository } from "../../../packages/graph/src/entity-repository.js";
import type { EventChain } from "../../../packages/graph/src/event-chain-builder.js";
import { EventChainBuilder } from "../../../packages/graph/src/event-chain-builder.js";
import { GraphTraversal } from "../../../packages/graph/src/graph-traversal.js";
import { RelationshipRepository } from "../../../packages/graph/src/relationship-repository.js";

describe("EventChainBuilder", () => {
  let builder: EventChainBuilder;
  let entities: EntityRepository;
  let relationships: RelationshipRepository;
  let traversal: GraphTraversal;

  const mockEntity = {
    id: "ent-1",
    entityType: "Event" as const,
    name: "Power Outage",
    properties: {
      observedAt: "2025-06-01T10:00:00.000Z",
      description: "Main grid failure",
      lat: 40.7128,
      lng: -74.006,
    },
    sourceId: "src-1",
    confidence: 0.95,
    createdAt: "2025-06-01T10:00:00.000Z",
  };

  const mockEntities = [
    mockEntity,
    {
      id: "ent-2",
      entityType: "Event" as const,
      name: "Transformer Sparks",
      properties: {
        observedAt: "2025-06-01T09:55:00.000Z",
        description: "Visible sparks at substation",
      },
      sourceId: "src-1",
      confidence: 0.9,
      createdAt: "2025-06-01T09:55:00.000Z",
    },
    {
      id: "ent-3",
      entityType: "Alert" as const,
      name: "Grid Alert #42",
      properties: {
        observedAt: "2025-06-01T10:05:00.000Z",
        summary: "Automated grid alert triggered",
      },
      sourceId: "src-2",
      confidence: 0.85,
      createdAt: "2025-06-01T10:05:00.000Z",
    },
    {
      id: "ent-4",
      entityType: "Location" as const,
      name: "Substation 7",
      properties: {
        lat: 40.713,
        lng: -74.007,
        createdAt: "2025-06-01T09:00:00.000Z",
      },
      sourceId: "src-3",
      confidence: 1,
      createdAt: "2025-06-01T09:00:00.000Z",
    },
  ];

  const mockRelationships = [
    {
      id: "rel-1",
      type: "CAUSES" as const,
      sourceId: "ent-2",
      targetId: "ent-1",
      properties: {},
      confidence: 0.9,
      createdAt: "2025-06-01T10:00:00.000Z",
    },
    {
      id: "rel-2",
      type: "CAUSES" as const,
      sourceId: "ent-1",
      targetId: "ent-3",
      properties: {},
      confidence: 0.85,
      createdAt: "2025-06-01T10:05:00.000Z",
    },
    {
      id: "rel-3",
      type: "CORRELATES_WITH" as const,
      sourceId: "ent-1",
      targetId: "ent-4",
      properties: {},
      confidence: 0.7,
      createdAt: "2025-06-01T10:00:00.000Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    entities = new EntityRepository(mockDriver as unknown as Driver);
    relationships = new RelationshipRepository(mockDriver as unknown as Driver);
    traversal = new GraphTraversal(mockDriver as unknown as Driver);
    builder = new EventChainBuilder(
      mockDriver as unknown as Driver,
      entities,
      relationships,
      traversal,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("buildChain", () => {
    it("builds a causal chain from a seed entity", async () => {
      vi.spyOn(traversal, "getSubgraph").mockResolvedValue({
        entities: mockEntities,
        relationships: mockRelationships,
      });

      const chain = await builder.buildChain("ent-1", { depth: 5, chainType: "causal" });

      expect(chain.seedEntityId).toBe("ent-1");
      expect(chain.seedEntityName).toBe("Power Outage");
      expect(chain.chainType).toBe("causal");
      expect(chain.steps.length).toBeGreaterThan(0);
      expect(chain.chainId).toBeTruthy();
      expect(chain.createdAt).toBeTruthy();

      const firstStep = chain.steps[0];
      expect(firstStep.entityId).toBeTruthy();
      expect(firstStep.sequenceNumber).toBe(0);
    });

    it("orders steps by timestamp ascending", async () => {
      vi.spyOn(traversal, "getSubgraph").mockResolvedValue({
        entities: mockEntities,
        relationships: mockRelationships,
      });

      const chain = await builder.buildChain("ent-1");
      const timestamps = chain.steps.map((s) => s.timestamp);
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i] >= timestamps[i - 1]).toBe(true);
      }
    });

    it("filters to CAUSES relationships only for causal chainType", async () => {
      vi.spyOn(traversal, "getSubgraph").mockResolvedValue({
        entities: mockEntities,
        relationships: mockRelationships,
      });

      const chain = await builder.buildChain("ent-1", { chainType: "causal" });

      for (const step of chain.steps) {
        for (const rel of [...step.incomingRelationships, ...step.outgoingRelationships]) {
          expect(["CAUSES", "CORRELATES_WITH"]).toContain(rel.type);
        }
      }
    });

    it("filters by time window when specified", async () => {
      vi.spyOn(traversal, "getSubgraph").mockResolvedValue({
        entities: mockEntities,
        relationships: mockRelationships,
      });

      const chain = await builder.buildChain("ent-1", { timeWindowMs: 60000 });

      for (const step of chain.steps) {
        const stepTime = new Date(step.timestamp).getTime();
        const seedTime = new Date("2025-06-01T10:00:00.000Z").getTime();
        expect(Math.abs(stepTime - seedTime)).toBeLessThanOrEqual(60000);
      }
    });

    it("throws when seed entity not in subgraph", async () => {
      vi.spyOn(traversal, "getSubgraph").mockResolvedValue({
        entities: [],
        relationships: [],
      });

      await expect(builder.buildChain("nonexistent")).rejects.toThrow(
        "Seed entity nonexistent not found in subgraph",
      );
    });

    it("calculates totalConfidence as average of step confidences", async () => {
      vi.spyOn(traversal, "getSubgraph").mockResolvedValue({
        entities: mockEntities,
        relationships: mockRelationships,
      });

      const chain = await builder.buildChain("ent-1");
      const avg = chain.steps.reduce((sum, s) => sum + s.confidence, 0) / chain.steps.length;
      expect(chain.totalConfidence).toBeCloseTo(avg, 5);
    });
  });

  describe("findCausalPath", () => {
    it("returns a chain when path exists between entities", async () => {
      vi.spyOn(relationships, "findPaths").mockResolvedValue([[mockRelationships[0]]]);
      vi.spyOn(entities, "getEntityById").mockImplementation(async (id: string) => {
        return mockEntities.find((e) => e.id === id) ?? null;
      });

      const chain = await builder.findCausalPath("ent-2", "ent-1");

      expect(chain).not.toBeNull();
      expect(chain?.seedEntityId).toBe("ent-2");
      expect(chain?.steps.length).toBeGreaterThan(0);
    });

    it("returns null when no path exists", async () => {
      vi.spyOn(relationships, "findPaths").mockResolvedValue([]);

      const chain = await builder.findCausalPath("ent-2", "ent-5");
      expect(chain).toBeNull();
    });

    it("returns null when path has no relationships", async () => {
      vi.spyOn(relationships, "findPaths").mockResolvedValue([[]]);

      const chain = await builder.findCausalPath("ent-2", "ent-1");
      expect(chain).toBeNull();
    });
  });

  describe("saveChain, getChain, deleteChain lifecycle", () => {
    const mockChain: EventChain = {
      chainId: "chain-1",
      seedEntityId: "ent-1",
      seedEntityName: "Power Outage",
      steps: [
        {
          sequenceNumber: 0,
          entityId: "ent-2",
          entityName: "Transformer Sparks",
          entityType: "Event",
          timestamp: "2025-06-01T09:55:00.000Z",
          description: "Visible sparks at substation",
          incomingRelationships: [],
          outgoingRelationships: [
            { type: "CAUSES", toEntityId: "ent-1", toEntityName: "Power Outage", confidence: 0.9 },
          ],
          confidence: 0.9,
        },
        {
          sequenceNumber: 1,
          entityId: "ent-1",
          entityName: "Power Outage",
          entityType: "Event",
          timestamp: "2025-06-01T10:00:00.000Z",
          location: { lat: 40.7128, lng: -74.006 },
          description: "Main grid failure",
          incomingRelationships: [
            {
              type: "CAUSES",
              fromEntityId: "ent-2",
              fromEntityName: "Transformer Sparks",
              confidence: 0.9,
            },
          ],
          outgoingRelationships: [
            {
              type: "CAUSES",
              toEntityId: "ent-3",
              toEntityName: "Grid Alert #42",
              confidence: 0.85,
            },
          ],
          confidence: 0.875,
        },
      ],
      totalConfidence: 0.8875,
      chainType: "causal",
      createdAt: "2025-06-01T10:00:00.000Z",
      metadata: {},
    };

    it("saves a chain and returns the chain ID", async () => {
      mockSession.run
        .mockResolvedValueOnce({
          records: [{ get: (key: string) => (key === "chainId" ? "chain-1" : undefined) }],
        })
        .mockResolvedValue({ records: [] });

      const result = await builder.saveChain(mockChain);
      expect(result).toBe("chain-1");
      expect(mockSession.run).toHaveBeenCalledTimes(3); // 1 create + 2 steps
    });

    it("retrieves a saved chain by ID", async () => {
      const chainProps = {
        chainId: "chain-1",
        seedEntityId: "ent-1",
        seedEntityName: "Power Outage",
        totalConfidence: 0.8875,
        chainType: "causal",
        createdAt: "2025-06-01T10:00:00.000Z",
        metadata: "{}",
      };

      const stepRelProps = {
        sequenceNumber: 0,
        confidence: 0.9,
        description: null,
      };

      const stepEntityProps = {
        name: "Transformer Sparks",
        entityType: "Event",
        properties: "{}",
        confidence: 0.9,
        observedAt: "2025-06-01T09:55:00.000Z",
        createdAt: "2025-06-01T09:55:00.000Z",
      };

      mockSession.run
        .mockResolvedValueOnce({
          records: [
            {
              get: (_key: string) => ({
                properties: chainProps,
                identity: { toString: () => "1" },
                labels: ["EventChain"],
              }),
            },
          ],
        })
        .mockResolvedValueOnce({
          records: [
            {
              get: (key: string) => {
                if (key === "r") return { properties: stepRelProps };
                if (key === "e")
                  return {
                    properties: stepEntityProps,
                    identity: { toString: () => "101" },
                    labels: ["Event"],
                  };
                return undefined;
              },
            },
          ],
        });

      const chain = await builder.getChain("chain-1");
      expect(chain).not.toBeNull();
      expect(chain?.chainId).toBe("chain-1");
      expect(chain?.steps.length).toBe(1);
    });

    it("returns null for non-existent chain", async () => {
      mockSession.run.mockResolvedValueOnce({ records: [] });

      const chain = await builder.getChain("nonexistent");
      expect(chain).toBeNull();
    });

    it("deletes a chain and returns true on success", async () => {
      mockSession.run.mockResolvedValueOnce({
        records: [
          { get: (key: string) => (key === "deleted" ? { toNumber: () => 1 } : undefined) },
        ],
      });

      const result = await builder.deleteChain("chain-1");
      expect(result).toBe(true);
    });

    it("returns false when deleting non-existent chain", async () => {
      mockSession.run.mockResolvedValueOnce({
        records: [
          { get: (key: string) => (key === "deleted" ? { toNumber: () => 0 } : undefined) },
        ],
      });

      const result = await builder.deleteChain("nonexistent");
      expect(result).toBe(false);
    });
  });
});
