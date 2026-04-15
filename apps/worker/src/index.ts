import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  type Clock,
  ingestFixtureTelemetryBatch,
  systemClock,
  validateFixtureTelemetryIngestionInput,
} from "../../../packages/ingestion/src/index.js";
import {
  refreshIncidentIntelligence,
  refreshOpenIncidentIntelligence,
} from "../../../packages/intelligence/src/index.js";
import { createLogger } from "../../../packages/logging/src/index.js";
import { PostgresPersistenceGateway } from "../../../packages/persistence/src/index.js";

export async function runFixtureTelemetryWorkerJob(input: {
  connection_string: string;
  payload: unknown;
  clock?: Clock;
}) {
  const validation = validateFixtureTelemetryIngestionInput(input.payload);

  if (!validation.ok) {
    return {
      status: "rejected" as const,
      issues: validation.issues,
    };
  }

  const persistence = PostgresPersistenceGateway.fromConnectionString(input.connection_string);

  try {
    return await ingestFixtureTelemetryBatch({
      command: validation.value,
      persistence,
      clock: input.clock ?? systemClock,
    });
  } finally {
    await persistence.close();
  }
}

export async function runIncidentIntelligenceWorkerJob(input: {
  connection_string: string;
  incident_id?: string;
  youtubeApiKey?: string | null;
}) {
  const persistence = PostgresPersistenceGateway.fromConnectionString(input.connection_string);
  const logger = createLogger("worker-incident-intelligence");

  try {
    if (input.incident_id) {
      const incident = await persistence.fetchIncident(input.incident_id);
      if (!incident) {
        return {
          status: "not_found" as const,
          incident_id: input.incident_id,
        };
      }

      const result = await refreshIncidentIntelligence({
        incident,
        persistence,
        logger,
        youtubeApiKey: input.youtubeApiKey ?? null,
      });

      return {
        status: "completed" as const,
        result,
      };
    }

    const result = await refreshOpenIncidentIntelligence({
      persistence,
      logger,
      youtubeApiKey: input.youtubeApiKey ?? null,
    });

    return {
      status: "completed" as const,
      result,
    };
  } finally {
    await persistence.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const connectionString = process.env.DATABASE_URL;
  const workerMode = process.env.WORKER_MODE || "fixture-telemetry";

  if (!connectionString) {
    throw new Error("DATABASE_URL must be set");
  }

  if (workerMode === "incident-intelligence") {
    runIncidentIntelligenceWorkerJob({
      connection_string: connectionString,
      incident_id: process.env.INTELLIGENCE_INCIDENT_ID,
      youtubeApiKey: process.env.YOUTUBE_API_KEY ?? null,
    }).then((result) => {
      console.log(JSON.stringify(result, null, 2));
    });
  } else {
    const payloadFile = process.env.WORKER_INPUT_FILE;

    if (!payloadFile) {
      throw new Error("WORKER_INPUT_FILE must be set for fixture-telemetry mode");
    }

    readFile(payloadFile, "utf8")
      .then((raw) => JSON.parse(raw))
      .then((payload) =>
        runFixtureTelemetryWorkerJob({
          connection_string: connectionString,
          payload,
        }),
      )
      .then((result) => {
        console.log(JSON.stringify(result, null, 2));
      });
  }
}
