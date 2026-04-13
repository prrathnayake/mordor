import { GenericContainer, Wait } from "testcontainers";
import { createPostgresDatabase, runMigrations } from "../../packages/persistence/src/index.js";

const DEFAULT_TEST_POSTGRES_IMAGE = "postgis/postgis:16-3.4-alpine";
const TEST_DATABASE_PREFIX = "chrona_test_";

export interface PostgresTestEnvironment {
  connection_string: string;
  database: ReturnType<typeof createPostgresDatabase>;
  stop(): Promise<void>;
}

type StartedPostgresContainer = Awaited<ReturnType<GenericContainer["start"]>>;

let sharedContainerPromise: Promise<StartedPostgresContainer> | null = null;
const SHARED_CONTAINER_START_ATTEMPTS = 3;

function buildConnectionString(container: StartedPostgresContainer, databaseName: string): string {
  return `postgres://postgres:postgres@${container.getHost()}:${container.getMappedPort(5432)}/${databaseName}`;
}

function createTestDatabaseName(): string {
  return `${TEST_DATABASE_PREFIX}${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z0-9_]+$/i.test(identifier)) {
    throw new Error(`Unsafe SQL identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

async function getSharedContainer(): Promise<StartedPostgresContainer> {
  if (!sharedContainerPromise) {
    sharedContainerPromise = startSharedContainerWithRetry();
  }

  try {
    return await sharedContainerPromise;
  } catch (error) {
    sharedContainerPromise = null;
    throw error;
  }
}

async function startSharedContainerWithRetry(): Promise<StartedPostgresContainer> {
  for (let attempt = 0; attempt < SHARED_CONTAINER_START_ATTEMPTS; attempt += 1) {
    try {
      return await startSharedContainer();
    } catch (error) {
      if (attempt === SHARED_CONTAINER_START_ATTEMPTS - 1) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  throw new Error("Unreachable container startup retry state");
}

async function startSharedContainer(): Promise<StartedPostgresContainer> {
  // Use the same image family as local docker-compose so the test harness works on Apple Silicon.
  return (
    new GenericContainer(process.env.TEST_POSTGRES_IMAGE ?? DEFAULT_TEST_POSTGRES_IMAGE)
      .withEnvironment({
        POSTGRES_DB: "chrona",
        POSTGRES_USER: "postgres",
        POSTGRES_PASSWORD: "postgres",
      })
      .withExposedPorts(5432)
      // Docker Desktop on Apple Silicon can take longer than the default 10s to bind random host ports.
      .withStartupTimeout(60_000)
      .withWaitStrategy(Wait.forLogMessage("database system is ready to accept connections"))
      .start()
  );
}

async function withAdminDatabase<T>(
  container: StartedPostgresContainer,
  run: (database: ReturnType<typeof createPostgresDatabase>) => Promise<T>,
): Promise<T> {
  const adminDatabase = createPostgresDatabase({
    connection_string: buildConnectionString(container, "postgres"),
  });

  try {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try {
        await adminDatabase.ping();
        break;
      } catch (error) {
        if (attempt === 29) {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return await run(adminDatabase);
  } finally {
    await adminDatabase.close();
  }
}

async function createTestDatabase(
  container: StartedPostgresContainer,
  databaseName: string,
): Promise<void> {
  await withAdminDatabase(container, async (database) => {
    await database.pool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  });
}

async function dropTestDatabase(
  container: StartedPostgresContainer,
  databaseName: string,
): Promise<void> {
  await withAdminDatabase(container, async (database) => {
    await database.pool.query(
      `
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `,
      [databaseName],
    );
    await database.pool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
  });
}

export async function startPostgresTestEnvironment(): Promise<PostgresTestEnvironment> {
  const container = await getSharedContainer();
  const databaseName = createTestDatabaseName();

  await createTestDatabase(container, databaseName);

  const connectionString = buildConnectionString(container, databaseName);
  const database = createPostgresDatabase({
    connection_string: connectionString,
  });

  try {
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
  } catch (error) {
    await database.close().catch(() => undefined);
    await dropTestDatabase(container, databaseName).catch(() => undefined);
    throw error;
  }

  let stopped = false;

  return {
    connection_string: connectionString,
    database,
    async stop() {
      if (stopped) {
        return;
      }

      stopped = true;
      await database.close();
      await dropTestDatabase(container, databaseName);
    },
  };
}
