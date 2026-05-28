import type { Driver } from "neo4j-driver";
import type { CausalLink } from "./causal-link-repository.js";
import { CausalLinkRepository } from "./causal-link-repository.js";
import type { FindEntitiesParams, GraphEntity } from "./entity-repository.js";
import { EntityRepository } from "./entity-repository.js";
import type { EventChain, EventChainStep } from "./event-chain-builder.js";
import { EventChainBuilder } from "./event-chain-builder.js";
import { GraphTraversal } from "./graph-traversal.js";
import type { Neo4jConfig } from "./neo4j-driver.js";
import {
  closeDriver,
  createNeo4jDriver,
  getDriver,
  getOrCreateDriver,
  verifyConnectivity,
} from "./neo4j-driver.js";
import type { GraphRelationship, RelationshipDirection } from "./relationship-repository.js";
import { RelationshipRepository } from "./relationship-repository.js";

export type {
  CausalLink,
  EventChain,
  EventChainStep,
  FindEntitiesParams,
  GraphEntity,
  GraphRelationship,
  Neo4jConfig,
  RelationshipDirection,
};
export {
  CausalLinkRepository,
  closeDriver,
  createNeo4jDriver,
  EntityRepository,
  EventChainBuilder,
  GraphTraversal,
  getDriver,
  getOrCreateDriver,
  RelationshipRepository,
  verifyConnectivity,
};

export interface GraphModule {
  driver: Driver;
  entities: EntityRepository;
  relationships: RelationshipRepository;
  traversal: GraphTraversal;
  close(): Promise<void>;
}

export function createGraphModule(config?: Neo4jConfig): GraphModule {
  const driver = getOrCreateDriver(config);
  const entities = new EntityRepository(driver);
  const relationships = new RelationshipRepository(driver);
  const traversal = new GraphTraversal(driver);

  return {
    driver,
    entities,
    relationships,
    traversal,
    async close() {
      await closeDriver();
    },
  };
}
