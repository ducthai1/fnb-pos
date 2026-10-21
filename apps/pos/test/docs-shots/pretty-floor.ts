import { vnd } from "@fnb/domain";
import type { FloorArea } from "../../src/features/floor/floor-occupancy";
import type { FloorTableView } from "../../src/features/floor/floor-tables-view";
import type { ShownTableStatus } from "../../src/features/floor/shown-table-status";

// The sample café's floor: two areas of six tables, as the seed lays them out, three to a
// row, with guests at some of them.

export const AREAS: readonly FloorArea[] = [
  { id: "area-in", name: "Trong nhà" },
  { id: "area-out", name: "Sân vườn" },
];

const SEATED: Readonly<Record<string, [ShownTableStatus, number, number]>> = {
  T02: ["occupied", 18, 143_000],
  T03: ["awaiting_payment", 52, 268_000],
  T05: ["changed_after_pre_bill", 75, 189_000],
  S01: ["occupied", 6, 64_000],
  S04: ["occupied", 33, 117_000],
};

export const TABLES: readonly FloorTableView[] = AREAS.flatMap((area, a) =>
  Array.from({ length: 6 }, (_, i) => {
    const name = `${a === 0 ? "T" : "S"}0${i + 1}`;
    const seated = SEATED[name];
    return {
      id: `table-${name}`,
      areaId: area.id,
      name,
      seats: i % 3 === 2 ? 6 : 4,
      status: seated?.[0] ?? "free",
      orderId: seated === undefined ? null : `order-${name}`,
      openedAt:
        seated === undefined ? null : new Date(Date.now() - seated[1] * 60_000).toISOString(),
      amountDue: seated === undefined ? null : vnd(seated[2]),
      layout: {
        x: (i % 3) * 160,
        y: Math.floor(i / 3) * 140,
        width: i % 3 === 2 ? 120 : 90,
        height: 90,
        shape: i % 3 === 1 ? "circle" : "rectangle",
      },
    } satisfies FloorTableView;
  }),
);
