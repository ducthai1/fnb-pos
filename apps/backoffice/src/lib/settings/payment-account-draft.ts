import { paymentAccountSchema } from "@fnb/contracts";

/** The receiving account form as typed. */
export interface PaymentAccountDraft {
  readonly bankBin: string;
  readonly accountNumber: string;
  readonly accountName: string;
}

export type PaymentAccountField = keyof PaymentAccountDraft;

export type PaymentAccountCheck =
  | { readonly ok: true; readonly value: PaymentAccountDraft }
  | { readonly ok: false; readonly errors: Partial<Record<PaymentAccountField, true>> };

const textIn = (record: Record<string, unknown>, key: string) =>
  typeof record[key] === "string" ? (record[key] as string) : "";

/** The form for the stored account, empty when the branch has none. */
export function paymentAccountDraftOf(value: unknown): PaymentAccountDraft {
  const stored = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    bankBin: textIn(stored, "bankBin"),
    accountNumber: textIn(stored, "accountNumber"),
    accountName: textIn(stored, "accountName"),
  };
}

/**
 * The account to send, or which fields the contract refuses. The account number loses
 * the spaces people type between groups of digits; the holder's name is kept as typed,
 * since tills show it beside the QR exactly as the bank spells it.
 */
export function checkPaymentAccountDraft(draft: PaymentAccountDraft): PaymentAccountCheck {
  const value = {
    bankBin: draft.bankBin.trim(),
    accountNumber: draft.accountNumber.replace(/\s+/g, ""),
    accountName: draft.accountName.trim(),
  };
  const parsed = paymentAccountSchema.safeParse(value);
  if (parsed.success) return { ok: true, value: parsed.data };
  const errors: Partial<Record<PaymentAccountField, true>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === "bankBin" || field === "accountNumber" || field === "accountName") errors[field] = true;
  }
  return { ok: false, errors };
}
