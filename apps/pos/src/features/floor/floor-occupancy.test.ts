import { describe, expect, it } from "vitest";
import { tid } from "../../test-support/till-fixtures";
import { parseFloorOccupancy } from "./floor-occupancy";

const area = {
  id: tid(1),
  branchId: tid(9),
  name: "Tầng 1",
  sortOrder: 0,
  version: 1,
  archivedAt: null,
};
const table = (n: number, fields: Record<string, unknown> = {}) => ({
  id: tid(100 + n),
  areaId: area.id,
  name: `Bàn ${n}`,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  shape: "rectangle",
  seats: 4,
  sortOrder: n,
  version: 1,
  archivedAt: null,
  status: "free",
  orderId: null,
  openedAt: null,
  ...fields,
});

describe("reading the floor the server sends a till", () => {
  it("keeps every table of the plan in order, with who sits at it", () => {
    const seated = { status: "occupied", orderId: tid(500), openedAt: "2026-10-20T03:00:00.000Z" };
    const floor = parseFloorOccupancy({ areas: [area], tables: [table(1), table(2, seated)] });
    expect(floor?.areas).toEqual([{ id: area.id, name: "Tầng 1" }]);
    expect(floor?.tables).toEqual([
      {
        id: tid(101),
        areaId: area.id,
        name: "Bàn 1",
        seats: 4,
        status: "free",
        orderId: null,
        openedAt: null,
      },
      { id: tid(102), areaId: area.id, name: "Bàn 2", seats: 4, ...seated },
    ]);
  });

  it("never offers an archived table, a table of an archived or unknown area, or an unknown status", () => {
    const gone = { ...area, id: tid(2), archivedAt: "2026-10-19T00:00:00.000Z" };
    const floor = parseFloorOccupancy({
      areas: [area, gone],
      tables: [
        table(1, { archivedAt: "2026-10-19T00:00:00.000Z" }),
        table(2, { areaId: gone.id }),
        table(3, { areaId: tid(3) }),
        table(4, { status: "merged" }),
        table(5),
      ],
    });
    expect(floor?.areas.map((shown) => shown.id)).toEqual([area.id]);
    expect(floor?.tables.map((shown) => shown.name)).toEqual(["Bàn 5"]);
  });

  it("is not an answer when the body is not the floor", () => {
    expect(parseFloorOccupancy(null)).toBeNull();
    expect(parseFloorOccupancy({ areas: [] })).toBeNull();
    expect(parseFloorOccupancy({ code: "API_INTERNAL" })).toBeNull();
  });
});
