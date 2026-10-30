import type { FeatureFlagKey } from "@fnb/feature-flags";

/** The kinds of shop a template is made for. */
export const SHOP_TEMPLATE_IDS = ["cafe", "milk_tea", "restaurant", "bar", "bakery"] as const;
export type ShopTemplateId = (typeof SHOP_TEMPLATE_IDS)[number];

/**
 * What a kind of shop starts with, only of the things the system has a home for: the
 * categories of the menu, the stations of the branch and the switches that suit it.
 * Switches a template leaves out are not its business, whatever they hold.
 */
export interface ShopTemplate {
  readonly id: ShopTemplateId;
  readonly name: string;
  /** One line on how the shop sells, for the person choosing. */
  readonly description: string;
  readonly categories: readonly string[];
  readonly stations: readonly string[];
  readonly flags: Readonly<Partial<Record<FeatureFlagKey, boolean>>>;
}

/**
 * A branch as far as a template cares. Names are as the shop wrote them. `flagsSetByShop`
 * holds only the switches someone chose, on the brand or on this branch; one that is not
 * there is still on its built-in value.
 */
export interface ShopSetup {
  readonly categoryNames: readonly string[];
  readonly stationNames: readonly string[];
  readonly flagsSetByShop: Readonly<Partial<Record<FeatureFlagKey, boolean>>>;
}

export type TemplateChange =
  | { readonly kind: "add_category"; readonly name: string }
  | { readonly kind: "add_station"; readonly name: string }
  | { readonly kind: "set_flag"; readonly flag: FeatureFlagKey; readonly value: boolean };

/** Why a switch the template wants is left as the shop has it. */
export type KeptReason = "chosen_by_shop" | "breaks_a_rule" | "locked";

export interface KeptFlag {
  readonly flag: FeatureFlagKey;
  /** What the template wants. */
  readonly wanted: boolean;
  /** What the branch runs with now. */
  readonly current: boolean;
  readonly reason: KeptReason;
}

/** What applying a template does to a branch: what it adds, and what it leaves alone. */
export interface TemplatePlan {
  readonly changes: readonly TemplateChange[];
  readonly kept: readonly KeptFlag[];
}
