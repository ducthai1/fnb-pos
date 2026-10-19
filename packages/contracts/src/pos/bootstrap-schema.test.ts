import {
  type OrderChargeProfile,
  type PriceListItem,
  type Product,
  validateModifierSelection,
} from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { outcomeOf, refusedPathsOf } from "../zod-issue-test-helpers";
import { type PosBootstrapWire, posBootstrapSchema } from "./bootstrap-schema";

const id = (n: number) => `0192f5a4-7c3e-7d10-8b2a-${String(n).padStart(12, "0")}`;

const product = {
  id: id(10),
  version: 41,
  brandId: id(2),
  categoryId: id(20),
  stationId: id(30),
  kind: "prepared_drink" as const,
  name: "Trà sữa trân châu",
  basePrice: 35_000,
  pricingMode: "fixed" as const,
  taxRate: 800,
  trackStock: false,
  earnsPoints: true,
  printCupLabel: true,
  variants: [
    { id: id(11), name: "M", price: null },
    { id: id(12), name: "L", price: 45_000 },
  ],
  modifierGroups: [
    {
      id: id(13),
      name: "Topping",
      minSelect: 0,
      maxSelect: 3,
      allowDuplicates: true,
      options: [{ id: id(14), name: "Trân châu đen", priceDelta: 5_000, maxQuantity: null }],
      variantRules: { [id(12)]: { maxSelect: 5 } },
    },
  ],
  combo: null,
};

function bootstrap(): PosBootstrapWire {
  return {
    cursor: "41",
    device: { id: id(1), name: "Quầy 1", branchId: id(3) },
    branch: {
      id: id(3),
      brandId: id(2),
      name: "Q1",
      utcOffsetMinutes: 420,
      businessDayStartMinute: 240,
    },
    brand: { id: id(2), name: "Trà Sữa Mây" },
    config: {
      id: id(1),
      version: 41,
      flags: { pay_first_counter: true, tables: false },
      settings: { void_after_sent_needs_approval: true },
      chargeProfile: { pricesIncludeTax: true, serviceCharge: null },
    },
    staff: [{ id: id(4), displayName: "Lan", active: true }],
    menu: {
      categories: [{ id: id(20), version: 41, brandId: id(2), name: "Trà sữa", sortOrder: 1 }],
      stations: [{ id: id(30), version: 41, branchId: id(3), name: "Bar" }],
      products: [product],
      priceLists: [
        {
          id: id(40),
          version: 41,
          brandId: id(2),
          name: "Giờ vàng",
          items: [
            {
              id: id(41),
              scope: { kind: "product", productId: id(10) },
              branchId: null,
              channelKey: null,
              validFrom: "2026-10-01T00:00:00.000Z",
              validTo: null,
              daysOfWeek: [1, 2, 3, 4, 5],
              timeWindow: { startMinute: 840, endMinute: 1020 },
              effect: { kind: "percent_off", rate: 2000, rounding: "half-up" },
              priority: 0,
            },
          ],
        },
      ],
      availability: [
        {
          productId: id(10),
          version: 41,
          entries: [{ channelKey: "grab", unavailableUntil: "2026-10-20T10:00:00.000Z" }],
        },
      ],
    },
  };
}

describe("posBootstrapSchema", () => {
  it("parses the menu into the domain's own types, ready to price with", () => {
    const parsed = posBootstrapSchema.parse(bootstrap());
    const [tea] = parsed.menu.products;
    const asProduct: Product | undefined = tea;
    const asItem: PriceListItem | undefined = parsed.menu.priceLists[0]?.items[0];
    const asProfile: OrderChargeProfile = parsed.config.chargeProfile;
    expect(tea?.basePrice).toBe(35_000n);
    expect(tea?.variants[1]?.price).toBe(45_000n);
    expect(asItem?.validFrom).toBe(Date.parse("2026-10-01T00:00:00.000Z"));
    expect(asItem?.effect).toEqual({ kind: "percent_off", rate: 2000, rounding: "half-up" });
    expect(asProfile).toEqual({ pricesIncludeTax: true, serviceCharge: null });
    expect(parsed.menu.availability[0]?.entries[0]?.unavailableUntil).toBe(
      Date.parse("2026-10-20T10:00:00.000Z"),
    );
    if (asProduct === undefined) throw new Error("no product parsed");
    // Size L lifts the topping cap to 5: the parsed rule applies without further mapping.
    const selection = [{ groupId: id(13), optionId: id(14), quantity: 4 }];
    const [toppings] = validateModifierSelection(asProduct, id(12), selection);
    expect(toppings?.priceDelta).toBe(20_000n);
  });

  it("leaves a limit a variant does not set absent, so it keeps inheriting the group's", () => {
    const parsed = posBootstrapSchema.parse(bootstrap());
    const rule = parsed.menu.products[0]?.modifierGroups[0]?.variantRules[id(12)];
    expect(rule).toEqual({ maxSelect: 5 });
    expect(Object.keys(rule ?? {})).toEqual(["maxSelect"]);
  });

  it("accepts the cursor of a feed nothing was written to yet", () => {
    expect(outcomeOf(posBootstrapSchema, { ...bootstrap(), cursor: "0" }).ok).toBe(true);
  });

  it.each([
    ["an amount sent as text", ["menu", "products", 0, "basePrice"], "35000"],
    ["an amount with a fraction", ["menu", "products", 0, "basePrice"], 35_000.5],
    ["a rate beyond 100%", ["menu", "products", 0, "taxRate"], 10_001],
    ["a version that is not a whole number", ["menu", "products", 0, "version"], 1.5],
    ["a cursor with a leading zero", ["cursor"], "041"],
    [
      "a moment without a zone",
      ["menu", "availability", 0, "entries", 0, "unavailableUntil"],
      "2026-10-20T10:00:00",
    ],
  ])("refuses %s", (_label, path, value) => {
    const wire = setAt(bootstrap(), path, value);
    expect(refusedPathsOf(posBootstrapSchema, wire)).toEqual([path.join(".")]);
  });

  it.each([
    ["staff", ["staff", 0, "pinHash"]],
    ["the device", ["device", "tokenHash"]],
    ["a product", ["menu", "products", 0, "costPrice"]],
  ])("refuses a field the contract does not name on %s", (_label, path) => {
    const wire = setAt(bootstrap(), path, "x");
    expect(outcomeOf(posBootstrapSchema, wire).ok).toBe(false);
  });
});

/** A copy of `value` with the field at `path` set, for one deliberately broken input. */
function setAt(value: unknown, path: readonly (string | number)[], leaf: unknown): unknown {
  const copy = structuredClone(value) as Record<string | number, unknown>;
  let node = copy;
  for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>;
  node[path.at(-1) as string | number] = leaf;
  return copy;
}
