import type pg from "pg";

/**
 * Columns, constraints, indexes and policies of `public` as one comparable value, so a
 * second migration run can be shown to change nothing at all.
 */
export async function describePublicSchema(client: pg.Client): Promise<unknown> {
  const queries = {
    columns: `SELECT table_name, column_name, data_type, is_nullable, column_default
              FROM information_schema.columns WHERE table_schema = 'public'
              ORDER BY table_name, column_name`,
    constraints: `SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS def
                  FROM pg_constraint WHERE connamespace = 'public'::regnamespace
                  ORDER BY table_name, conname`,
    indexes: `SELECT tablename, indexname, indexdef FROM pg_indexes
              WHERE schemaname = 'public' ORDER BY tablename, indexname`,
    policies: `SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
               WHERE schemaname = 'public' ORDER BY tablename, policyname`,
    rowSecurity: `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
                  WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' ORDER BY relname`,
  };
  const result: Record<string, unknown[]> = {};
  for (const [name, sql] of Object.entries(queries)) result[name] = (await client.query(sql)).rows;
  return result;
}
