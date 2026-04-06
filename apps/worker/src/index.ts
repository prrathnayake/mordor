import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  type Clock,
  ingestFixtureTelemetryBatch,
  systemClock,
  validateFixtureTelemetryIngestionInput,
} from "../../../packages/ingestion/src/index.js";
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const connectionString = process.env.DATABASE_URL;
  const payloadFile = process.env.WORKER_INPUT_FILE;

  if (!connectionString || !payloadFile) {
    throw new Error("DATABASE_URL and WORKER_INPUT_FILE must be set");
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
