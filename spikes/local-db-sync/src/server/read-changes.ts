import type { Pool } from "pg";
import type { ChangeWire, PullResponseWire } from "../shared/sync-wire-types";

/** Changes strictly after `cursor`, oldest first; the cursor is an opaque decimal change_seq. */
export async function readChanges(
  pool: Pool,
  cursor: string,
  limit: number,
): Promise<PullResponseWire> {
  const { rows } = await pool.query<ChangeWire>(
    `SELECT change_seq::text AS change_seq, entity, data FROM change_log
     WHERE change_seq > $1::bigint ORDER BY change_seq LIMIT $2`,
    [cursor, limit],
  );
  return {
    changes: rows,
    next_cursor: rows.at(-1)?.change_seq ?? cursor,
    has_more: rows.length === limit,
  };
}
