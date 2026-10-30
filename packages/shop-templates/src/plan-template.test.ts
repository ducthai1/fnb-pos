import { validateFlags } from "@fnb/feature-flags";
import { describe, expect, it } from "vitest";
import { planTemplate } from "./plan-template";
import { sameNameKey } from "./same-name-key";
import { SHOP_TEMPLATES, shopTemplateById } from "./shop-templates";

const EMPTY = { categoryNames: [], stationNames: [], flagsSetByShop: {} };
const restaurant = shopTemplateById("restaurant")!;
const cafe = shopTemplateById("cafe")!;

describe("the templates", () => {
  it("are five, each with categories, stations and switches that obey the catalog's rules", () => {
    expect(SHOP_TEMPLATES.map((t) => t.id)).toEqual(["cafe", "milk_tea", "restaurant", "bar", "bakery"]);
    for (const each of SHOP_TEMPLATES) {
      expect(each.categories.length, each.id).toBeGreaterThan(2);
      expect(each.stations.length, each.id).toBeGreaterThan(0);
      expect(validateFlags(each.flags), each.id).toEqual([]);
      expect(new Set(each.categories.map(sameNameKey)).size, each.id).toBe(each.categories.length);
      expect(new Set(each.stations.map(sameNameKey)).size, each.id).toBe(each.stations.length);
    }
  });

  it("find by id and refuse an unknown one", () => {
    expect(shopTemplateById("bar")?.name).toBe("Quán bar");
    expect(shopTemplateById("nope")).toBeUndefined();
  });
});

describe("planning a template for a branch", () => {
  it("on a bare branch adds everything and sets only the switches that differ from the built-in ones", () => {
    const plan = planTemplate(restaurant, EMPTY);
    expect(plan.changes.filter((c) => c.kind === "add_category")).toHaveLength(6);
    expect(plan.changes.filter((c) => c.kind === "add_station").map((c) => c.kind === "add_station" && c.name)).toEqual(["Bếp nóng", "Bếp lạnh", "Bar nước"]);
    expect(plan.changes.filter((c) => c.kind === "set_flag")).toEqual([
      { kind: "set_flag", flag: "tables", value: true },
      { kind: "set_flag", flag: "course_firing", value: true },
      { kind: "set_flag", flag: "kitchen_routing", value: true },
    ]);
    // The till always takes money first, so a template cannot turn that off.
    expect(plan.kept).toEqual([{ flag: "pay_first_counter", wanted: false, current: true, reason: "locked" }]);
  });

  it("leaves the pay-first counter on whatever the shop stored for it", () => {
    const plan = planTemplate(restaurant, { ...EMPTY, flagsSetByShop: { pay_first_counter: false } });
    expect(plan.changes).not.toContainEqual({ kind: "set_flag", flag: "pay_first_counter", value: false });
    expect(plan.kept).toContainEqual({ flag: "pay_first_counter", wanted: false, current: true, reason: "locked" });
  });

  it("adds only what is missing, comparing names the way a person does", () => {
    const plan = planTemplate(cafe, { ...EMPTY, categoryNames: ["ca phe", " TRÀ "], stationNames: ["bar"] });
    expect(plan.changes.filter((c) => c.kind === "add_category").map((c) => c.kind === "add_category" && c.name)).toEqual(["Nước ép và sinh tố", "Bánh ngọt", "Đồ ăn nhẹ"]);
    expect(plan.changes.some((c) => c.kind === "add_station")).toBe(false);
  });

  it("leaves a switch the shop chose, and says so", () => {
    const plan = planTemplate(restaurant, { ...EMPTY, flagsSetByShop: { tables: false, pay_first_counter: false } });
    expect(plan.kept).toContainEqual({ flag: "tables", wanted: true, current: false, reason: "chosen_by_shop" });
    expect(plan.changes).not.toContainEqual({ kind: "set_flag", flag: "tables", value: true });
    // Course firing needs the floor plan the shop turned off, so it is left too.
    expect(plan.kept).toContainEqual({ flag: "course_firing", wanted: true, current: false, reason: "breaks_a_rule" });
    expect(plan.changes).not.toContainEqual({ kind: "set_flag", flag: "pay_first_counter", value: false });
  });
});
