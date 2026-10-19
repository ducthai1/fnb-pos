import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { outcomeOf, refusedPathsOf } from "../zod-issue-test-helpers";
import { FLOOR_PLAN_EXTENT, areaBodySchema, diningTableBodySchema } from "./floor-body-schemas";

const ID = "0192f5a4-7c3e-7d10-8b2a-3f9e1c4d5a6b";

const table = {
  version: null,
  areaId: ID,
  name: "B01",
  x: 0,
  y: 120,
  width: 80,
  height: 80,
  shape: "circle",
  seats: 4,
};

describe("area body", () => {
  it("trims the name and fills the sort order when left out", () => {
    expect(areaBodySchema.parse({ version: null, branchId: ID, name: " Sân vườn " })).toEqual({
      version: null,
      branchId: ID,
      name: "Sân vườn",
      sortOrder: 0,
    });
  });

  it("refuses a blank name, a version of zero and a field it does not know", () => {
    const area = { version: null, branchId: ID, name: "Tầng 1" };
    expect(outcomeOf(areaBodySchema, area).ok).toBe(true);
    expect(refusedPathsOf(areaBodySchema, { ...area, name: "   " })).toEqual(["name"]);
    expect(refusedPathsOf(areaBodySchema, { ...area, version: 0 })).toEqual(["version"]);
    expect(refusedPathsOf(areaBodySchema, { ...area, nmae: "x" })).toEqual([""]);
  });
});

describe("dining table body", () => {
  it("takes a table with its place, size, shape and seats", () => {
    expect(diningTableBodySchema.parse(table)).toEqual({ ...table, sortOrder: 0 });
  });

  it.each([
    ["an unknown shape", { shape: "hexagon" }, "shape"],
    ["no seats", { seats: 0 }, "seats"],
    ["a hundred seats", { seats: 100 }, "seats"],
    ["a zero width", { width: 0 }, "width"],
    ["a fractional height", { height: 80.5 }, "height"],
    ["a blank name", { name: " " }, "name"],
    ["a name past 40 characters", { name: "B".repeat(41) }, "name"],
  ])("refuses %s", (_label, change, path) => {
    expect(refusedPathsOf(diningTableBodySchema, { ...table, ...change })).toEqual([path]);
  });

  it("keeps every table inside the plan, and refuses one placed off it", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: FLOOR_PLAN_EXTENT }),
        fc.integer({ min: 0, max: FLOOR_PLAN_EXTENT }),
        (x, y) => outcomeOf(diningTableBodySchema, { ...table, x, y }).ok,
      ),
    );
    fc.assert(
      fc.property(
        fc.oneof(fc.integer({ max: -1 }), fc.integer({ min: FLOOR_PLAN_EXTENT + 1 })),
        (outside) =>
          !outcomeOf(diningTableBodySchema, { ...table, x: outside }).ok &&
          !outcomeOf(diningTableBodySchema, { ...table, y: outside }).ok,
      ),
    );
  });
});
