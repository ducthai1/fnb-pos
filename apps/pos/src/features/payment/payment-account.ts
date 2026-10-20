import {
  type PaymentAccount,
  type PosDeviceConfig,
  paymentAccountSettingSchema,
} from "@fnb/contracts";

const PAYMENT_ACCOUNT_SETTING = "payment_account";

/**
 * The account the branch's QRs ask customers to transfer to, or null while none is set (or
 * one this till cannot read): with no account there is no QR to show, only other methods.
 */
export function paymentAccountOf(config: PosDeviceConfig): PaymentAccount | null {
  const parsed = paymentAccountSettingSchema.safeParse(
    config.settings[PAYMENT_ACCOUNT_SETTING] ?? null,
  );
  return parsed.success ? parsed.data : null;
}
