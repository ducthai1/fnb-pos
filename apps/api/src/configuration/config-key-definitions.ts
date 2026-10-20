import {
  type ConfigScopeKind,
  closeDifferenceToleranceSettingSchema,
  einvoiceProfileSettingSchema,
  paymentAccountSettingSchema,
  posChargeProfileSchema,
  voidAfterSentNeedsApprovalSettingSchema,
} from "@fnb/contracts";
import {
  CONFIG_SETTING_DEFAULTS,
  type ConfigSettingKey,
  FEATURE_FLAG_CATALOG,
  type FeatureFlagScope,
} from "@fnb/feature-flags";
import { z } from "zod";
import {
  CLOSE_DIFFERENCE_TOLERANCE_DEFAULT,
  CLOSE_DIFFERENCE_TOLERANCE_KEY,
} from "../sync/close-difference-tolerance";

/** What the settings routes know of one key: its kind, how specific it may get, its shape. */
export interface ConfigKeyDefinition {
  readonly key: string;
  readonly kind: "flag" | "setting";
  /** The most specific layer allowed to set it; broader layers may set it too. */
  readonly scope: FeatureFlagScope;
  readonly value: z.ZodType<unknown, z.ZodTypeDef, unknown>;
  readonly systemDefault: unknown;
}

interface SettingRule {
  readonly scope: FeatureFlagScope;
  readonly value: z.ZodType<unknown, z.ZodTypeDef, unknown>;
}

/*
 * Every setting of the catalog needs a rule here: the record is keyed by ConfigSettingKey,
 * so a setting added there without saying how it is checked does not compile. Pricing,
 * payment and invoicing are per branch (a branch prices, takes money and invoices as one
 * shop, so two tills of it must agree); the drawer tolerance may differ per till.
 */
const SETTING_RULES: Readonly<Record<ConfigSettingKey, SettingRule>> = {
  charge_profile: { scope: "branch", value: posChargeProfileSchema },
  void_after_sent_needs_approval: {
    scope: "branch",
    value: voidAfterSentNeedsApprovalSettingSchema,
  },
  payment_account: { scope: "branch", value: paymentAccountSettingSchema },
  einvoice_profile: { scope: "branch", value: einvoiceProfileSettingSchema },
};

const DEFINITIONS: readonly ConfigKeyDefinition[] = [
  ...FEATURE_FLAG_CATALOG.map((flag) => ({
    key: flag.key,
    kind: "flag" as const,
    scope: flag.scope,
    value: z.boolean(),
    systemDefault: flag.default,
  })),
  ...Object.entries(SETTING_RULES).map(([key, rule]) => ({
    key,
    kind: "setting" as const,
    ...rule,
    systemDefault: CONFIG_SETTING_DEFAULTS[key as ConfigSettingKey],
  })),
  {
    key: CLOSE_DIFFERENCE_TOLERANCE_KEY,
    kind: "setting",
    scope: "device",
    value: closeDifferenceToleranceSettingSchema,
    systemDefault: CLOSE_DIFFERENCE_TOLERANCE_DEFAULT,
  },
];

/** Every key the settings routes take, flags first, each in catalog order. */
export const CONFIG_KEY_DEFINITIONS: ReadonlyMap<string, ConfigKeyDefinition> = new Map(
  DEFINITIONS.map((definition) => [definition.key, definition]),
);

const RANK: Readonly<Record<ConfigScopeKind, number>> = { brand: 0, branch: 1, device: 2 };

/** Whether `layer` may set the key: no more specific than the key's own scope. */
export const layerMaySet = (definition: ConfigKeyDefinition, layer: ConfigScopeKind): boolean =>
  RANK[layer] <= RANK[definition.scope];

/** The built-in default of every known key: the system layer settings resolve onto. */
export function systemLayer(): Record<string, unknown> {
  return Object.fromEntries(
    DEFINITIONS.map((definition) => [definition.key, definition.systemDefault]),
  );
}
