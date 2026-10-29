import { planTemplate } from "./plan-template";
import type { ShopSetup, ShopTemplate } from "./shop-template-types";

/**
 * The branch as it is after the template is applied: the same shop with what the template
 * adds. Idempotent by construction: the plan only lists what is missing, so applying twice
 * is applying once, and nothing the shop had is changed.
 */
export function applyTemplate(template: ShopTemplate, shop: ShopSetup): ShopSetup {
  const { changes } = planTemplate(template, shop);
  const flagsSetByShop = { ...shop.flagsSetByShop };
  const categoryNames = [...shop.categoryNames];
  const stationNames = [...shop.stationNames];
  for (const change of changes) {
    if (change.kind === "add_category") categoryNames.push(change.name);
    else if (change.kind === "add_station") stationNames.push(change.name);
    else flagsSetByShop[change.flag] = change.value;
  }
  return { categoryNames, stationNames, flagsSetByShop };
}
