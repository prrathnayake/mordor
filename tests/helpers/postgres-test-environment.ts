import { GenericContainer, Wait } from "testcontainers";
import { createPostgresDatabase, runMigrations } from "../../packages/persistence/src/index.js";

export interface PostgresTestEnvironment {
  connection_string: string;
  database: ReturnType<typeof createPostgresDatabase>;
  stop(): Promise<void>;
}

export async function startPostgresTestEnvironment(): Promise<PostgresTestEnvironment> {
  const container = await new GenericContainer("postgis/postgis:17-3.5")
    .withEnvironment({
      POSTGRES_DB: "chrona",
      POSTGRES_USER: "postgres",
      POSTGRES_PASSWORD: "postgres",
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage("database system is ready to accept connections"))
    .start();

  const connectionString = `postgres://postgres:postgres@${container.getHost()}:${container.getMappedPort(5432)}/chrona`;
  const database = createPostgresDatabase({
    connection_string: connectionString,
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await database.ping();
      break;
    } catch (error) {
      if (attempt === 29) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  await runMigrations(database);

  return {
    connection_string: connectionString,
    database,
    async stop() {
      await database.close();
      await container.stop();
    },
  };
}
