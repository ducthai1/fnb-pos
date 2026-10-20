import { z } from "zod";

/**
 * The bank account a branch's tills ask customers to transfer to, set as the
 * `payment_account` setting. A till builds its VietQR from this alone, so a QR can be shown
 * while the shop is offline; the holder's name is what the till shows beside it.
 */
export const paymentAccountSchema = z
  .object({
    /** The receiving bank's six-digit NAPAS BIN, e.g. 970436 for Vietcombank. */
    bankBin: z.string().regex(/^\d{6}$/),
    accountNumber: z.string().regex(/^[0-9A-Za-z]{1,19}$/),
    accountName: z
      .string()
      .max(80)
      .refine((name) => name.trim() !== "", { message: "account name is blank" }),
  })
  .strict();

export type PaymentAccount = z.infer<typeof paymentAccountSchema>;

/** The setting as resolved for a till: null until the branch (or its brand) sets one. */
export const paymentAccountSettingSchema = paymentAccountSchema.nullable();
