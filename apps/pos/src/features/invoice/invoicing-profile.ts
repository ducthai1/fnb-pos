import { type PosDeviceConfig, einvoiceProfileSettingSchema } from "@fnb/contracts";

const EINVOICE_PROFILE_SETTING = "einvoice_profile";

/**
 * Whether the branch issues an e-invoice for each sale, as the till's settings say. Only
 * then is there an invoice to put a buyer on: the server refuses buyer details otherwise.
 */
export function invoicingEnabled(config: PosDeviceConfig): boolean {
  const parsed = einvoiceProfileSettingSchema.safeParse(
    config.settings[EINVOICE_PROFILE_SETTING] ?? null,
  );
  return parsed.success && parsed.data !== null && parsed.data.enabled;
}
