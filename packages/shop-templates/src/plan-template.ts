import { type FeatureFlagKey, type FlagViolation, featureFlagDefaults, isFlagLockedOn, validateFlags } from "@fnb/feature-flags";
import { sameNameKey } from "./same-name-key";
import type { KeptFlag, ShopSetup, ShopTemplate, TemplateChange, TemplatePlan } from "./shop-template-types";

const defaults = featureFlagDefaults() as Readonly<Record<FeatureFlagKey, boolean>>;

const violationKey = (violation: FlagViolation): string => JSON.stringify(violation);

/** Whether setting `flag` makes the switches break a rule that they did not break before. */
function breaksARule(chosen: Readonly<Partial<Record<FeatureFlagKey, boolean>>>, flag: FeatureFlagKey, value: boolean): boolean {
  const before = new Set(validateFlags(chosen).map(violationKey));
  return validateFlags({ ...chosen, [flag]: value }).some((violation) => !before.has(violationKey(violation)));
}

/** The names of `wanted` that `present` has no entry for, once each, in the template's order. */
function missingNames(wanted: readonly string[], present: readonly string[]): string[] {
  const known = new Set(present.map(sameNameKey));
  const missing: string[] = [];
  for (const name of wanted) {
    const key = sameNameKey(name);
    if (known.has(key)) continue;
    known.add(key);
    missing.push(name);
  }
  return missing;
}

/**
 * What applying `template` to the branch would add, and which of its switches it leaves as
 * the shop has them. It only ever adds: nothing the shop made is renamed or removed. A
 * switch the shop chose stays, even against the template; one still on its built-in value
 * is set if the template wants another, unless that would break a rule between switches
 * (course firing without a floor plan), in which case it is left too. A switch the till
 * cannot turn off (the pay-first counter) is left as it is, whatever the template says.
 */
export function planTemplate(template: ShopTemplate, shop: ShopSetup): TemplatePlan {
  const changes: TemplateChange[] = [
    ...missingNames(template.categories, shop.categoryNames).map((name) => ({ kind: "add_category" as const, name })),
    ...missingNames(template.stations, shop.stationNames).map((name) => ({ kind: "add_station" as const, name })),
  ];
  const kept: KeptFlag[] = [];
  const chosen: Partial<Record<FeatureFlagKey, boolean>> = { ...shop.flagsSetByShop };
  const current = (flag: FeatureFlagKey): boolean => chosen[flag] ?? defaults[flag];
  for (const [flag, wanted] of Object.entries(template.flags) as [FeatureFlagKey, boolean][]) {
    // A switch the till always follows as "on" is not the template's to turn off.
    if (isFlagLockedOn(flag) && !wanted) {
      kept.push({ flag, wanted, current: true, reason: "locked" });
      continue;
    }
    if (current(flag) === wanted) continue;
    if (Object.hasOwn(chosen, flag)) {
      kept.push({ flag, wanted, current: current(flag), reason: "chosen_by_shop" });
      continue;
    }
    if (breaksARule(chosen, flag, wanted)) {
      kept.push({ flag, wanted, current: current(flag), reason: "breaks_a_rule" });
      continue;
    }
    chosen[flag] = wanted;
    changes.push({ kind: "set_flag", flag, value: wanted });
  }
  return { changes, kept };
}
