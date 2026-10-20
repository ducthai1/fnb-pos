import { FLOOR_PLAN_EXTENT } from "@fnb/contracts";
import { describe, expect, it } from "vitest";
import type { DiningTable } from "../api/floor-api";
import { NUDGE, PLAN_STEP, movedTableBody, nudge, placeAt, planBox } from "./plan-geometry";

const table = (change: Partial<DiningTable> = {}): DiningTable =>
  ({
    id: "t1",
    areaId: "a1",
    name: "Bàn 1",
    x: 1_000,
    y: 500,
    width: 800,
    height: 600,
    shape: "rectangle",
    seats: 4,
    sortOrder: 10,
    version: 3,
    archivedAt: null,
    ...change,
  }) as DiningTable;

describe("the part of the plan the editor shows", () => {
  it("is a small room at least, and holds every table with room to drag into", () => {
    expect(planBox([])).toEqual({ width: 2_400, height: 1_500 });
    expect(planBox([table({ x: 6_000, y: 4_000 })])).toEqual({ width: 7_400, height: 5_200 });
  });

  it("never runs past the edge the contract allows", () => {
    expect(planBox([table({ x: FLOOR_PLAN_EXTENT, y: FLOOR_PLAN_EXTENT, width: 2_000 })])).toEqual({
      width: FLOOR_PLAN_EXTENT,
      height: FLOOR_PLAN_EXTENT,
    });
  });
});

describe("where a dragged table lands", () => {
  it("snaps to the step grid", () => {
    expect(placeAt(table(), 1_234, 1_276)).toEqual({ x: 1_250, y: 1_300 });
    expect(PLAN_STEP).toBe(50);
  });

  it("stays wholly inside the plan, never at a negative place", () => {
    expect(placeAt(table(), -400, -10)).toEqual({ x: 0, y: 0 });
    expect(placeAt(table(), 99_999, 99_999)).toEqual({ x: FLOOR_PLAN_EXTENT - 800, y: FLOOR_PLAN_EXTENT - 600 });
  });

  it("moves by the arrow keys, five times as far with Shift, and ignores other keys", () => {
    expect(nudge(table(), "ArrowRight", false)).toEqual({ x: 1_000 + NUDGE, y: 500 });
    expect(nudge(table(), "ArrowUp", true)).toEqual({ x: 1_000, y: 0 });
    expect(nudge(table(), "ArrowLeft", true)).toEqual({ x: 500, y: 500 });
    expect(nudge(table(), "Enter", false)).toBeNull();
  });

  it("writes only the new place, keeping the version, name, size and seats it was read with", () => {
    expect(movedTableBody(table(), 2_000, 1_500)).toMatchObject({
      version: 3,
      areaId: "a1",
      name: "Bàn 1",
      x: 2_000,
      y: 1_500,
      width: 800,
      height: 600,
      shape: "rectangle",
      seats: 4,
      sortOrder: 10,
    });
  });
});
