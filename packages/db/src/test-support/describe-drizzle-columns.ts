import { getTableConfig } from "drizzle-orm/pg-core";
import { auditTables } from "../schema/audit-tables";
import { configurationTables } from "../schema/configuration-tables";
import { tenancyTables } from "../schema/tenancy-tables";

export interface ColumnShape {
  table: string;
  column: string;
  /** As Postgres prints it with format_type(), e.g. "timestamp with time zone". */
  type: string;
  notNull: boolean;
}

/** The columns the Drizzle tables claim, for comparison with the migrated database. */
export function describeDrizzleColumns(): ColumnShape[] {
  return [tenancyTables, auditTables, configurationTables]
    .flatMap((tables) => Object.values(tables))
    .flatMap((table) => {
      const config = getTableConfig(table);
      return config.columns.map((column) => ({
        table: config.name,
        column: column.name,
        type: column.getSQLType(),
        notNull: column.notNull,
      }));
    })
    .sort((x, y) => `${x.table}.${x.column}`.localeCompare(`${y.table}.${y.column}`));
}
