import { describe, expect, it } from "vitest";
import { SALE_MENU, paidSale } from "../../test-support/paid-sale-fixture";
import { MENU } from "../../test-support/till-fixtures";
import type { TillMenu } from "../menu/till-menu";
import { cupLabelSlip } from "./cup-label-slip";
import { kitchenSlips } from "./kitchen-slips";

const KITCHEN = "0199f000-0000-7000-8000-0000000000b1";
const AT = Date.UTC(2026, 9, 20, 3, 1);

/** The sample café with a kitchen too: the cake is made there, the drinks at the bar. */
function menuWith(flags: Record<string, boolean>): TillMenu {
  const cake = SALE_MENU.productsById.get(MENU.cake);
  if (cake === undefined) throw new Error("the sample menu sells a cake");
  return {
    ...SALE_MENU,
    stations: new Map([
      ...SALE_MENU.stations,
      [KITCHEN, { id: KITCHEN, version: 1, branchId: SALE_MENU.branch.id, name: "Bếp" }],
    ]),
    productsById: new Map([
      ...SALE_MENU.productsById,
      [MENU.cake, { ...cake, stationId: KITCHEN }],
    ]),
    config: { ...SALE_MENU.config, flags },
  };
}

const namesOn = (job: { preview: string }) => job.preview;

describe("splitting the kitchen slips by station", () => {
  it("prints one slip per station while the switch is on", () => {
    const tickets = kitchenSlips(menuWith({ kitchen_routing: true }), paidSale(), AT);
    expect(tickets.map((ticket) => ticket.stationId).sort()).toEqual([MENU.bar, KITCHEN].sort());
  });

  it("prints one shared slip, on the first station by name, when it is off", () => {
    for (const flags of [{ kitchen_routing: false }, {}]) {
      const tickets = kitchenSlips(menuWith(flags), paidSale(), AT);
      expect(tickets).toHaveLength(1);
      const [slip] = tickets;
      expect(slip?.stationId).toBe(MENU.bar);
      expect(slip?.lines.map((line) => line.lineId)).toHaveLength(3);
      const text = namesOn(slip!.job);
      expect(text.replaceAll(" ", "")).toContain("Phiếuchung");
      expect(text).toContain("Bánh");
      expect(text).toContain("Trà sữa");
    }
  });

  it("still prints nothing for an item no station makes", () => {
    const menu = menuWith({});
    const cake = menu.productsById.get(MENU.cake);
    const withoutStation = {
      ...menu,
      productsById: new Map([...menu.productsById, [MENU.cake, { ...cake!, stationId: null }]]),
    };
    const [slip] = kitchenSlips(withoutStation, paidSale(), AT);
    expect(slip?.lines).toHaveLength(2);
  });
});

describe("printing cup labels", () => {
  it("prints them only while the switch is on", () => {
    expect(cupLabelSlip(menuWith({ cup_labels: true }), paidSale(), AT)).not.toBeNull();
    expect(cupLabelSlip(menuWith({ cup_labels: false }), paidSale(), AT)).toBeNull();
    expect(cupLabelSlip(menuWith({}), paidSale(), AT)).toBeNull();
  });
});
