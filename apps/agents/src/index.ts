import { pathToFileURL } from "node:url";
import { CollectorAgent, createCollectorAgent } from "./collector.js";
import { createDetectorAgent, DetectorAgent } from "./detector.js";
import type { BaseAgentWorker } from "./worker.js";

const AGENT_MODE = process.env.AGENT_MODE || "collector";
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const REDIS_URL = process.env.REDIS_URL ?? "";

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
    default:
      throw new Error(`Unknown AGENT_MODE: ${AGENT_MODE}`);
  }

  process.on("SIGINT", async () => {
    console.log("Shutting down...");
    await worker.stop();
    process.exit(0);
  });

  await worker.start();
  console.log(`Agent started: ${AGENT_MODE} (${AGENT_ID})`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
