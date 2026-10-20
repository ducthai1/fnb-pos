import { vnd } from "@fnb/domain";
import type { FloorArea } from "../../../src/features/floor/floor-occupancy";
import type { FloorTableView } from "../../../src/features/floor/floor-tables-view";
import type { ShownTableStatus } from "../../../src/features/floor/shown-table-status";
import { HOSTILE_NAMES } from "../../../src/test-support/hostile-names";

// A floor a big restaurant could really set up: 60 tables, names at the API's limits with
// nowhere to wrap, and bills of nine digits.

const unbroken = (seed: string, length: number) =>
  seed.repeat(Math.ceil(length / seed.length)).slice(0, length);

export const HOSTILE_FLOOR_NAMES = {
  /** 60 characters: the longest area name the backoffice takes. */
  area: unbroken("KhuSânVườnSauNhàCóMáiCheTầngHai", 60),
  /** 40 characters: the longest table name. */
  table: unbroken("BànVIPSânThượngCạnhHồBơi", 40),
} as const;

export const HOSTILE_AREAS: readonly FloorArea[] = [
  { id: "area-0", name: HOSTILE_FLOOR_NAMES.area },
  { id: "area-1", name: HOSTILE_NAMES.emoji },
  { id: "area-2", name: HOSTILE_NAMES.decomposed },
];

const STATUSES: readonly ShownTableStatus[] = [
  "free",
  "occupied",
  "awaiting_payment",
  "changed_after_pre_bill",
];

/** 999.999.999 đ: the most a table's bill shows in nine digits. */
export const NINE_DIGIT_BILL = vnd(999_999_999);

export const HOSTILE_TABLES: readonly FloorTableView[] = Array.from({ length: 60 }, (_, i) => {
  const status = STATUSES[i % STATUSES.length] ?? "free";
  const name =
    i === 0
      ? HOSTILE_FLOOR_NAMES.table
      : i === 1
        ? HOSTILE_NAMES.emoji.slice(0, 40)
        : `${HOSTILE_NAMES.decomposed} ${i}`.slice(0, 40);
  return {
    id: `table-${i}`,
    areaId: "area-0",
    name,
    seats: 99,
    status,
    orderId: status === "free" ? null : `order-${i}`,
    openedAt: status === "free" ? null : new Date(Date.now() - (i * 37 + 5) * 60_000).toISOString(),
    amountDue: status === "free" ? null : NINE_DIGIT_BILL,
  };
});
