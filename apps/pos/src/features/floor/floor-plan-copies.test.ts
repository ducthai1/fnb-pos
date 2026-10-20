import type { PosFloorPlan, PosFloorTable } from "@fnb/contracts";
import { describe, expect, it } from "vitest";
import { NO_FLOOR_COPIES, floorPlanOf } from "./floor-plan-copies";

const AREA = "01a15b50-0000-7000-8000-000000000001";
const BRANCH = "01a15b50-0000-7000-8000-000000000002";
const table = (id: string, place: Partial<PosFloorTable>): PosFloorTable => ({
  id,
  areaId: AREA,
  name: `Bàn ${id.slice(-1)}`,
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  shape: "rectangle",
  seats: 4,
  sortOrder: 0,
  version: 1,
  ...place,
});
const plan = (tables: PosFloorTable[]): PosFloorPlan => ({
  areas: [{ id: AREA, branchId: BRANCH, name: "Tầng 1", sortOrder: 0, version: 1 }],
  tables,
});

describe("floorPlanOf", () => {
  it("keeps where each table of the bootstrap stands, so the plan can draw it", () => {
    const [round] = floorPlanOf(
      plan([
        table("01a15b50-0000-7000-8000-000000000011", {
          x: 300,
          y: 50,
          width: 120,
          height: 120,
          shape: "circle",
        }),
      ]),
      NO_FLOOR_COPIES,
      new Set(),
    ).tables;
    expect(round?.layout).toEqual({ x: 300, y: 50, width: 120, height: 120, shape: "circle" });
  });

  it("leaves a table with no size to the grid instead of drawing it", () => {
    const [flat] = floorPlanOf(
      plan([table("01a15b50-0000-7000-8000-000000000012", { width: 0 })]),
      NO_FLOOR_COPIES,
      new Set(),
    ).tables;
    expect(flat?.layout).toBeNull();
  });
});
