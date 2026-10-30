import { readConfigLayersForDevice } from "@fnb/db";
import { type FeatureFlagKey, configDefaults, resolveConfig } from "@fnb/feature-flags";
import type pg from "pg";

/**
 * Whether a feature switch is on for one till: its own value, else its branch's, else its
 * brand's, else the built-in default; the same reading the till gets in its settings.
 */
export async function readDeviceFeatureFlag(
  client: pg.ClientBase,
  deviceId: string,
  key: FeatureFlagKey,
): Promise<boolean> {
  const layers = await readConfigLayersForDevice(client, deviceId);
  return resolveConfig(key, { ...layers, system: configDefaults() }).value === true;
}
