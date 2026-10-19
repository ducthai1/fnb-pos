import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { tenancyTables } from "../schema/tenancy-tables";

/** A typed query builder on a client borrowed inside withTenant. */
export function drizzleFor(client: pg.PoolClient) {
  return drizzle({ client, schema: tenancyTables });
}
