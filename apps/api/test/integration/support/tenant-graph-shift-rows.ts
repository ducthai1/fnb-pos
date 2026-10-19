import type { RowSpec, Sql } from "./tenant-graph-rows";

const aStaff: Sql = { sql: "(SELECT id FROM staff ORDER BY id LIMIT 1)" };

// A shift counts each denomination once per stage, so every call takes a note the
// shift's closing count has not used yet (the seeded row is an opening count).
const unusedClosingDenomination: Sql = {
  sql:
    "(SELECT d FROM unnest(ARRAY[500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, " +
    "500000]::bigint[]) AS d WHERE d NOT IN (SELECT denomination FROM shift_count " +
    "WHERE stage = 'closing') ORDER BY d LIMIT 1)",
};

/** RowSpecs of the shift tables, merged into the tenant graph's ROWS. */
export const SHIFT_ROWS = {
  cash_move: {
    parent: { column: "shift_id", table: "shift" },
    values: () => ({ kind: "in", amount: 1, reason: "x", staff_id: aStaff }),
  },
  shift_count: {
    parent: { column: "shift_id", table: "shift" },
    values: () => ({ stage: "closing", denomination: unusedClosingDenomination, pieces: 0 }),
  },
} satisfies Record<string, RowSpec>;
