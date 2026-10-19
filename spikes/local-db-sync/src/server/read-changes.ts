import type { Pool } from "pg";
import type { ChangeWire, PullResponseWire } from "../shared/sync-wire-types";

/**
 * Changes strictly after `cursor`, oldest first; the cursor is an opaque decimal change_seq.
 * change_seq is selected as is (node-postgres already returns int8 as text): with
 * `change_seq::text AS change_seq`, ORDER BY binds to that text alias and sorts "10" before
 * "9", so a full page ends early and the rows sorted after its last one are never sent.
 */
export async function readChanges(
  pool: Pool,
  cursor: string,
  limit: number,
): Promise<PullResponseWire> {
  const { rows } = await pool.query<ChangeWire>(
    `SELECT change_seq, entity, data FROM change_log
     WHERE change_seq > $1::bigint ORDER BY change_seq LIMIT $2`,
    [cursor, limit],
  );
  return {
    changes: rows,
    next_cursor: rows.at(-1)?.change_seq ?? cursor,
    has_more: rows.length === limit,
  };
}
