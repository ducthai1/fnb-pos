export const FEATURE_FLAG_KEYS = [
  "tables",
  "pay_first_counter",
  "cup_labels",
  "kitchen_routing",
  "course_firing",
  "qr_ordering",
  "happy_hour_pricing",
  "inventory_tracking",
  "auto_86_on_zero_stock",
  "allow_negative_stock",
  "einvoice",
  "cash_rounding",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

/**
 * The most specific layer allowed to set the flag; broader layers may set it too. A device
 * flag can differ between two tills of one branch, a branch flag only between branches.
 */
export type FeatureFlagScope = "brand" | "branch" | "device";

export interface FeatureFlagDefinition {
  readonly key: FeatureFlagKey;
  readonly default: boolean;
  /** Flags that must be on whenever this one is. */
  readonly requires: readonly FeatureFlagKey[];
  /** Flags that must be off whenever this one is on. Declared on both sides. */
  readonly excludes: readonly FeatureFlagKey[];
  readonly scope: FeatureFlagScope;
}

const flag = (
  key: FeatureFlagKey,
  scope: FeatureFlagScope,
  options: Partial<Pick<FeatureFlagDefinition, "default" | "requires" | "excludes">> = {},
): FeatureFlagDefinition => ({
  key,
  scope,
  default: options.default ?? false,
  requires: options.requires ?? [],
  excludes: options.excludes ?? [],
});

/**
 * Defaults fit the most common shop, a café or milk tea counter: customers order and pay
 * at the counter, nothing else is on until the shop sets it up.
 */
export const FEATURE_FLAG_CATALOG: readonly FeatureFlagDefinition[] = [
  // A floor plan belongs to a branch's premises.
  flag("tables", "branch"),
  // A branch can run a pay-first counter till next to waiter tablets that bill at the end.
  flag("pay_first_counter", "device", { default: true }),
  // Labels need a label printer, which is attached to one till.
  flag("cup_labels", "device"),
  flag("kitchen_routing", "branch"),
  // Firing courses and guests ordering by QR both hang off a table.
  flag("course_firing", "branch", { requires: ["tables"] }),
  flag("qr_ordering", "branch", { requires: ["tables"] }),
  // Prices are a brand decision, so every branch of a brand runs the same happy hour.
  flag("happy_hour_pricing", "brand"),
  flag("inventory_tracking", "branch"),
  // Marking an item sold out at zero and selling below zero contradict each other.
  flag("auto_86_on_zero_stock", "branch", {
    requires: ["inventory_tracking"],
    excludes: ["allow_negative_stock"],
  }),
  flag("allow_negative_stock", "branch", {
    requires: ["inventory_tracking"],
    excludes: ["auto_86_on_zero_stock"],
  }),
  // Each branch registers its own invoice series with the tax office.
  flag("einvoice", "branch"),
  flag("cash_rounding", "branch"),
];

/** The defaults keyed by flag, ready to serve as the system layer of resolveConfig. */
export function featureFlagDefaults(
  catalog: readonly FeatureFlagDefinition[] = FEATURE_FLAG_CATALOG,
): Readonly<Record<string, boolean>> {
  return Object.fromEntries(catalog.map((definition) => [definition.key, definition.default]));
}
