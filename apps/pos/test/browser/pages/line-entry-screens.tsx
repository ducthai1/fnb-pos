import { posProductSchema } from "@fnb/contracts";
import { vnd } from "@fnb/domain";
import type { ReactElement } from "react";
import { LineEntryDrawer } from "../../../src/screens/sale/line-entry-drawer";
import { HOSTILE_PRODUCT } from "../../../src/test-support/hostile-menu";
import { HOSTILE_NAMES } from "../../../src/test-support/hostile-names";
import { overTheSale } from "./checkout-screens";

// The price and weight drawers over the hostile order, with the longest name and the
// largest figures they take; see screens-page.tsx.

const never = () => new Promise<never>(() => {});
const typed = posProductSchema.parse({
  ...HOSTILE_PRODUCT,
  pricingMode: "open_price",
  basePrice: 99_999_000,
});
const weighed = posProductSchema.parse({
  ...HOSTILE_PRODUCT,
  pricingMode: "weighed",
  measureUnit: "100g",
  variants: [],
});
const common = {
  onType: () => {},
  editing: false,
  busy: false,
  onConfirm: () => {},
  onClose: () => {},
};

export const LINE_ENTRY_SCREENS = {
  "line-entry-price": () =>
    overTheSale(
      <LineEntryDrawer
        {...common}
        product={typed}
        kind="price"
        typed="100000000"
        needsManager
        error={HOSTILE_NAMES.reason}
      />,
    ),
  "line-entry-weight": () =>
    overTheSale(
      <LineEntryDrawer
        {...common}
        product={weighed}
        kind="weight"
        per={{ price: vnd(99_999_000), unit: "100g" }}
        typed="100000"
        editing
        needsManager={false}
        error={null}
        scale={{ readGrams: never }}
      />,
    ),
} satisfies Record<string, () => ReactElement>;
