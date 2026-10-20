import { describe, expect, it } from "vitest";
import { outcomeOf } from "../zod-issue-test-helpers";
import { posFloorPlanSchema } from "./pos-floor-schemas";

const id = (n: number) => `0192f5a4-7c3e-7d10-8b2a-${String(n).padStart(12, "0")}`;
const area = { id: id(1), branchId: id(2), name: "Tầng 1", sortOrder: 0, version: 1 };
const table = {
  id: id(3),
  areaId: id(1),
  name: "B01",
  x: 40,
  y: 40,
  width: 80,
  height: 80,
  shape: "rectangle",
  seats: 4,
  sortOrder: 0,
  version: 2,
};

describe("posFloorPlanSchema", () => {
  it("takes areas and tables as the bootstrap and the feed send them", () => {
    const plan = { areas: [area], tables: [table] };
    expect(posFloorPlanSchema.parse(plan)).toEqual(plan);
  });

  it.each([
    ["a table without its version", { tables: [{ ...table, version: undefined }] }],
    ["a table of a shape the floor screen cannot draw", { tables: [{ ...table, shape: "oval" }] }],
    ["an archived area's stamp", { areas: [{ ...area, archivedAt: null }] }],
  ])("refuses %s", (_case, change) => {
    expect(outcomeOf(posFloorPlanSchema, { areas: [area], tables: [table], ...change }).ok).toBe(
      false,
    );
  });
});
