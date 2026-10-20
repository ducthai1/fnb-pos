import { featureFlagDefaults } from "./feature-flag-catalog";

/**
 * Settings that are values rather than on/off switches, with the default each has when no
 * brand, branch or device changed it. They sit apart from the flag catalog because a flag
 * has requires/excludes rules and a boolean default, and these have neither. Values are
 * plain JSON, as config_value stores them; the code that reads a setting parses it into
 * its own type, so this package stays free of the domain's types.
 */
export const CONFIG_SETTING_DEFAULTS = {
  /**
   * How an order is priced: the café default is menu prices including VAT and no service
   * charge. A new order copies the profile in effect for its till, so changing it later
   * never reprices orders already taken. serviceCharge, when set, is
   * { rate, appliesTo, base, taxRate } with rates in basis points.
   */
  charge_profile: { pricesIncludeTax: true, serviceCharge: null },
  /** Cancelling units the kitchen already has needs someone allowed to approve it. */
  void_after_sent_needs_approval: true,
  /**
   * The bank account a branch's tills build their VietQR from, as { bankBin, accountNumber,
   * accountName }. None until the shop sets one: a till without it offers no QR transfer,
   * rather than a QR into an account nobody chose.
   */
  payment_account: null,
} as const;

export type ConfigSettingKey = keyof typeof CONFIG_SETTING_DEFAULTS;

/** The system layer of resolveConfig: every flag's default and every setting's. */
export function configDefaults(): Readonly<Record<string, unknown>> {
  return { ...featureFlagDefaults(), ...CONFIG_SETTING_DEFAULTS };
}
