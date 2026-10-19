import { describeDrizzleColumns, testConnectionString } from "@fnb/db/test-support";
import { describe, expect, inject, it } from "vitest";
import { withClient } from "../support/with-client";

const info = inject("testPostgres");

// The SQL migrations define the schema; the Drizzle tables only mirror it for typed
// queries. A column renamed, retyped or made nullable on one side only fails here.
describe("Drizzle tables", () => {
  it("declare exactly the columns, types and nullability the migrations created", async () => {
    const database = await withClient(testConnectionString(info, "app"), async (client) => {
      const result = await client.query(`
        SELECT c.relname AS table, a.attname AS column,
               format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS "notNull"
        FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
          AND a.attnum > 0 AND NOT a.attisdropped`);
      return result.rows.sort((x, y) =>
        `${x.table}.${x.column}`.localeCompare(`${y.table}.${y.column}`),
      );
    });
    expect(database.length).toBeGreaterThan(0);
    expect(describeDrizzleColumns()).toEqual(database);
  });
});
