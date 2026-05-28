import { pathToFileURL } from "node:url";
import { CollectorAgent, createCollectorAgent } from "./collector.js";
import { createDetectorAgent, DetectorAgent } from "./detector.js";
import { createEntityExtractorAgent, EntityExtractorAgent } from "./entity-extractor.js";
import { createPublisherAgent, PublisherAgent } from "./publisher.js";
import { createRelationshipMinerAgent, RelationshipMinerAgent } from "./relationship-miner.js";
import type { BaseAgentWorker } from "./worker.js";

const AGENT_MODE = process.env.AGENT_MODE || "collector";
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const REDIS_URL = process.env.REDIS_URL ?? "";
const NEO4J_URI = process.env.NEO4J_URI ?? "bolt://127.0.0.1:7687";
const NEO4J_USER = process.env.NEO4J_USER ?? "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? "password";
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? "";

if (!DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

if (!REDIS_URL) {
  throw new Error("REDIS_URL must be set");
}

const AGENT_ID = process.env.AGENT_ID || `agent_${Date.now()}`;

async function main() {
  let worker: BaseAgentWorker;

  switch (AGENT_MODE) {
    case "collector": {
      const config = createCollectorAgent({
        agentId: AGENT_ID,
        databaseUrl: DATABASE_URL,
        redisUrl: REDIS_URL,
      });
      worker = new CollectorAgent(config);
      break;
    }
    case "detector": {
      const config = createDetectorAgent({
        agentId: AGENT_ID,
        databaseUrl: DATABASE_URL,
        redisUrl: REDIS_URL,
      });
      worker = new DetectorAgent(config);
      break;
    }
    case "entity-extractor": {
      if (!OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY must be set for entity-extractor agent");
      }
      const config = createEntityExtractorAgent({
        agentId: AGENT_ID,
        databaseUrl: DATABASE_URL,
        redisUrl: REDIS_URL,
        neo4jUri: NEO4J_URI,
        neo4jUser: NEO4J_USER,
        neo4jPassword: NEO4J_PASSWORD,
        openrouterApiKey: OPENROUTER_API_KEY,
      });
      worker = new EntityExtractorAgent(config, config);
      break;
    }
    case "publisher": {
      const config = createPublisherAgent({
        agentId: AGENT_ID,
        databaseUrl: DATABASE_URL,
        redisUrl: REDIS_URL,
      });
      worker = new PublisherAgent(config);
      break;
    }
    case "relationship-miner": {
      if (!OPENROUTER_API_KEY) {
        throw new Error("OPENROUTER_API_KEY must be set for relationship-miner agent");
      }
      const config = createRelationshipMinerAgent({
        agentId: AGENT_ID,
        databaseUrl: DATABASE_URL,
        redisUrl: REDIS_URL,
        neo4jUri: NEO4J_URI,
        neo4jUser: NEO4J_USER,
        neo4jPassword: NEO4J_PASSWORD,
        openrouterApiKey: OPENROUTER_API_KEY,
      });
      worker = new RelationshipMinerAgent(config, config);
      break;
    }
    default:
      throw new Error(`Unknown AGENT_MODE: ${AGENT_MODE}`);
  }

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down...`);
    await worker.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await worker.start();
  console.log(`Agent started: ${AGENT_MODE} (${AGENT_ID})`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
