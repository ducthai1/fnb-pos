import { describe, expect, it } from "vitest";
import type { TableLayout } from "./floor-occupancy";
import { planBoxOf, planReadable, spotIn } from "./floor-plan-box";

const at = (x: number, y: number, width = 80, height = 80): { layout: TableLayout } => ({
  layout: { x, y, width, height, shape: "rectangle" },
});

describe("planBoxOf", () => {
  it("holds every table, measured from the first one rather than the editor's corner", () => {
    expect(planBoxOf([at(40, 40), at(280, 160, 120, 60)])).toEqual({
      left: 40,
      top: 40,
      width: 360,
      height: 180,
    });
  });

  it("is null for an area without tables or with a table that has no place", () => {
    expect(planBoxOf([])).toBeNull();
    expect(planBoxOf([at(0, 0), { layout: null }])).toBeNull();
  });
});

describe("spotIn", () => {
  it("places a table by percentages of its area's box", () => {
    const box = { left: 40, top: 40, width: 400, height: 200 };
    expect(spotIn(box, at(240, 140, 80, 50).layout)).toEqual({
      left: 50,
      top: 50,
      width: 20,
      height: 25,
    });
  });
});

describe("planReadable", () => {
  it("reads a room of tables, not one where a far table shrinks the rest to dots", () => {
    const room = [at(0, 0), at(400, 0), at(0, 300)];
    expect(planReadable(planBoxOf(room)!, room)).toBe(true);
    const stray = [...room, at(9_920, 0)];
    expect(planReadable(planBoxOf(stray)!, stray)).toBe(false);
  });
});
