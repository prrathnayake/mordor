import { startPostgresTestEnvironment } from "../helpers/postgres-test-environment.js";

describe("initial migration baseline", () => {
  it("creates the required Postgres/PostGIS tables and canonical append-only trigger", async () => {
    const environment = await startPostgresTestEnvironment();

    try {
      const tables = await environment.database.pool.query<{ relname: string }>(
        `
          SELECT c.relname
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public'
            AND c.relkind = 'r'
            AND c.relname = ANY($1::text[])
          ORDER BY c.relname ASC
        `,
        [
          [
            "alerts",
            "audit_logs",
            "canonical_events",
            "latest_object_states",
            "raw_payloads",
            "sources",
            "tracked_objects",
          ],
        ],
      );
      const postgisExtension = await environment.database.pool.query<{ extname: string }>(
        "SELECT extname FROM pg_extension WHERE extname = 'postgis'",
      );
      const trigger = await environment.database.pool.query<{ tgname: string }>(
        "SELECT tgname FROM pg_trigger WHERE tgname = 'canonical_events_no_update'",
      );

      expect(tables.rows.map((row) => row.relname)).toEqual([
        "alerts",
        "audit_logs",
        "canonical_events",
        "latest_object_states",
        "raw_payloads",
        "sources",
        "tracked_objects",
      ]);
      expect(postgisExtension.rows[0]?.extname).toBe("postgis");
      expect(trigger.rows[0]?.tgname).toBe("canonical_events_no_update");
    } finally {
      await environment.stop();
    }
  });
});
