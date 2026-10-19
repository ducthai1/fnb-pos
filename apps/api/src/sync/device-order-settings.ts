import { readConfigLayersForDevice } from "@fnb/db";
import { type OrderChargeProfile, isDomainError } from "@fnb/domain";
import { configDefaults, resolveConfig } from "@fnb/feature-flags";
import type pg from "pg";
import { ZodError } from "zod";
import { chargeProfileFromStored } from "./charge-profile-snapshot";
import { CommandRejection, SYNC_ERROR_CODES } from "./sync-error-codes";

/** The settings order commands follow, as they apply to one till. */
export interface DeviceOrderSettings {
  /** The profile a new order opened on the till is priced with, and keeps. */
  readonly chargeProfile: OrderChargeProfile;
  /** Whether cancelling units the kitchen has needs an approver. */
  readonly voidAfterSentNeedsApproval: boolean;
}

/**
 * The till's settings: its own value, else its branch's, else its brand's, else the
 * built-in default. A stored value the server cannot read refuses the command rather than
 * pricing it with a guess; the till shows the code and the shop fixes the setting.
 */
export async function readDeviceOrderSettings(
  client: pg.ClientBase,
  deviceId: string,
): Promise<DeviceOrderSettings> {
  const layers = await readConfigLayersForDevice(client, deviceId);
  const stack = { ...layers, system: configDefaults() };
  const voidSetting = resolveConfig("void_after_sent_needs_approval", stack).value;
  if (typeof voidSetting !== "boolean") throw new CommandRejection(SYNC_ERROR_CODES.settingInvalid);
  try {
    return {
      chargeProfile: chargeProfileFromStored(resolveConfig("charge_profile", stack).value),
      voidAfterSentNeedsApproval: voidSetting,
    };
  } catch (error) {
    if (error instanceof ZodError || isDomainError(error)) {
      throw new CommandRejection(SYNC_ERROR_CODES.settingInvalid);
    }
    throw error;
  }
}
