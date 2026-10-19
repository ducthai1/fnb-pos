import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { allTables } from "../schema/all-tables";

/** A typed query builder on a client borrowed inside withTenant. */
export function drizzleFor(client: pg.PoolClient) {
  return drizzle({ client, schema: allTables });
}
