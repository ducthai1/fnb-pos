import { type PosProductWire, posProductSchema } from "@fnb/contracts";
import { MENU, MILK_TEA, tid } from "./till-fixtures";

export const RULES = {
  ice: tid(0x700),
  lessIce: tid(0x701),
  noIce: tid(0x702),
  cream: tid(0x703),
  cheese: tid(0x704),
  sides: tid(0x705),
  cookie: tid(0x706),
  wafer: tid(0x707),
  brownie: tid(0x708),
} as const;

/**
 * A milk tea carrying one group per rule a shop can set: a required pick-one (sugar), up to 2
 * toppings or 3 in L with pearls at most 2, ice that cannot repeat, a cheese foam offered in
 * L only, and sides of which at least 2 must be picked.
 */
export const RULES_TEA_WIRE: PosProductWire = {
  ...MILK_TEA,
  id: tid(0x710),
  name: "Trà sữa đủ luật",
  modifierGroups: [
    ...MILK_TEA.modifierGroups,
    {
      id: RULES.ice,
      name: "Đá",
      minSelect: 0,
      maxSelect: 2,
      allowDuplicates: false,
      options: [
        { id: RULES.lessIce, name: "Ít đá", priceDelta: 0, maxQuantity: null },
        { id: RULES.noIce, name: "Không đá", priceDelta: 0, maxQuantity: null },
      ],
      variantRules: {},
    },
    {
      id: RULES.cream,
      name: "Kem",
      minSelect: 0,
      maxSelect: 1,
      allowDuplicates: false,
      options: [{ id: RULES.cheese, name: "Kem cheese", priceDelta: 10_000, maxQuantity: null }],
      variantRules: { [MENU.sizeM]: { hidden: true } },
    },
    {
      id: RULES.sides,
      name: "Bánh kèm",
      minSelect: 0,
      maxSelect: 3,
      allowDuplicates: false,
      options: [
        { id: RULES.cookie, name: "Bánh quy", priceDelta: 3_000, maxQuantity: null },
        { id: RULES.wafer, name: "Bánh xốp", priceDelta: 3_000, maxQuantity: null },
        { id: RULES.brownie, name: "Brownie", priceDelta: 3_000, maxQuantity: null },
      ],
      variantRules: { [MENU.sizeL]: { minSelect: 2 } },
    },
  ],
};

export const RULES_TEA = posProductSchema.parse(RULES_TEA_WIRE);
