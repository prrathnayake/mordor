import { readdir, readFile } from "node:fs/promises";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

function migrationsDirectoryUrl(): URL {
  return new URL("../../../infra/migrations/", import.meta.url);
}

export interface PostgresDatabase {
  readonly pool: Pool;
  close(): Promise<void>;
  ping(): Promise<void>;
}

export function createPostgresDatabase(input: { connection_string: string }): PostgresDatabase {
  const poolMax = process.env.DATABASE_POOL_MAX
    ? Number.parseInt(process.env.DATABASE_POOL_MAX, 10)
    : 10;
  const pool = new Pool({
    connectionString: input.connection_string,
    max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 10,
  });

  return {
    pool,
    async close() {
      await pool.end();
    },
    async ping() {
      await pool.query("SELECT 1");
    },
  };
}

export async function withTransaction<T>(
  database: PostgresDatabase,
  run: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await database.pool.connect();

  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function runMigrations(database: PostgresDatabase): Promise<void> {
  const migrationDirectory = migrationsDirectoryUrl();
  const migrationEntries = await readdir(migrationDirectory, { withFileTypes: true });
  const migrationFiles = migrationEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  for (const migrationFile of migrationFiles) {
    const sql = await readFile(new URL(migrationFile, migrationDirectory), "utf8");
    await database.pool.query(sql);
  }
}

export function coerceIsoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function expectRow<T extends QueryResultRow>(rows: T[], message: string): T {
  const row = rows[0];

  if (!row) {
    throw new Error(message);
  }

  return row;
}
