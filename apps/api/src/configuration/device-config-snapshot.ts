import {
  PAYMENT_WALLETS_SETTING,
  type PosDeviceConfigWire,
  WALLET_KEYS,
  paymentAccountSettingSchema,
} from "@fnb/contracts";
import { readConfigLayersForDevice } from "@fnb/db";
import {
  CONFIG_SETTING_DEFAULTS,
  FEATURE_FLAG_KEYS,
  configDefaults,
  resolveConfig,
} from "@fnb/feature-flags";
import type pg from "pg";
import type { Unversioned } from "../catalog/pos-menu-snapshots";
import { chargeProfileFromStored } from "../sync/charge-profile-snapshot";

const CHARGE_PROFILE_KEY = "charge_profile";
const PAYMENT_ACCOUNT_KEY = "payment_account";

/**
 * A till's settings as it runs with them: every switch and setting resolved through device,
 * branch and brand down to the built-in default, and the charge profile parsed the way
 * order commands price with it. A stored value that cannot be read throws: a till started
 * on a guessed setting would sell differently from what the server then accepts.
 */
export async function readDeviceConfigSnapshot(
  client: pg.PoolClient,
  deviceId: string,
): Promise<Unversioned<PosDeviceConfigWire>> {
  const layers = await readConfigLayersForDevice(client, deviceId);
  const stack = { brand: layers.brand, branch: layers.branch, device: layers.device };
  const resolve = (key: string) => resolveConfig(key, { ...stack, system: configDefaults() }).value;
  const flags: Record<string, boolean> = {};
  for (const key of FEATURE_FLAG_KEYS) {
    const value = resolve(key);
    if (typeof value !== "boolean") throw new Error(`stored switch ${key} is not on or off`);
    flags[key] = value;
  }
  const settings: Record<string, unknown> = {};
  for (const key of Object.keys(CONFIG_SETTING_DEFAULTS)) {
    if (key !== CHARGE_PROFILE_KEY) settings[key] = resolve(key);
  }
  // A till builds its QR from this account alone: one it could not build from is refused
  // here, before any till is handed it.
  if (!paymentAccountSettingSchema.safeParse(settings[PAYMENT_ACCOUNT_KEY]).success) {
    throw new Error("stored payment_account is not a bank account a QR can name");
  }
  settings[PAYMENT_WALLETS_SETTING] = await walletsTurnedOn(client, deviceId);
  const profile = chargeProfileFromStored(resolve(CHARGE_PROFILE_KEY));
  const rule = profile.serviceCharge;
  return {
    id: deviceId,
    flags,
    settings,
    chargeProfile: {
      pricesIncludeTax: profile.pricesIncludeTax,
      serviceCharge:
        rule === null
          ? null
          : {
              rate: rule.rate,
              appliesTo: [...rule.appliesTo],
              base: rule.base,
              taxRate: rule.taxRate,
            },
    },
  };
}

/**
 * The e-wallets the till's branch turned on with keys saved, in the order tills show them.
 * Derived from the wallet keys' rows rather than set as a value, so a till can never offer
 * a wallet the server has no keys to open a payment with.
 */
async function walletsTurnedOn(client: pg.PoolClient, deviceId: string): Promise<string[]> {
  const { rows } = await client.query<{ gateway: string }>(
    "SELECT e.gateway FROM payment_webhook_endpoint e JOIN device d " +
      "ON d.tenant_id = e.tenant_id AND d.branch_id = e.branch_id " +
      "WHERE d.id = $1 AND e.enabled AND e.gateway = ANY ($2::text[])",
    [deviceId, [...WALLET_KEYS]],
  );
  const on = new Set(rows.map((row) => row.gateway));
  return WALLET_KEYS.filter((key) => on.has(key));
}
