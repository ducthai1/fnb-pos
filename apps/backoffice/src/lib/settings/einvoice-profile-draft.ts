import { EINVOICE_REGIME_VERSIONS, type EInvoiceProfile, einvoiceProfileSchema } from "@fnb/contracts";

/** The invoicing profile form as typed. */
export interface EInvoiceProfileDraft {
  readonly enabled: boolean;
  readonly sellerTaxCode: string;
  readonly sellerName: string;
  readonly sellerAddress: string;
  readonly templateSymbol: string;
  readonly provider: string;
  readonly regimeVersion: string;
  readonly refundInvoicing: "none" | "adjustment";
}

export type EInvoiceProfileField = Exclude<keyof EInvoiceProfileDraft, "enabled">;

const FIELDS: readonly string[] = [
  "sellerTaxCode",
  "sellerName",
  "sellerAddress",
  "templateSymbol",
  "provider",
  "regimeVersion",
  "refundInvoicing",
];

export type EInvoiceProfileCheck =
  | { readonly ok: true; readonly value: EInvoiceProfile }
  | { readonly ok: false; readonly errors: Partial<Record<EInvoiceProfileField, true>> };

const textIn = (record: Record<string, unknown>, key: string, fallback = "") =>
  typeof record[key] === "string" ? (record[key] as string) : fallback;

/** The form for the stored profile; a branch without one starts disabled, on the known regime. */
export function einvoiceProfileDraftOf(value: unknown): EInvoiceProfileDraft {
  const stored = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    enabled: stored.enabled === true,
    sellerTaxCode: textIn(stored, "sellerTaxCode"),
    sellerName: textIn(stored, "sellerName"),
    sellerAddress: textIn(stored, "sellerAddress"),
    templateSymbol: textIn(stored, "templateSymbol"),
    provider: textIn(stored, "provider"),
    regimeVersion: textIn(stored, "regimeVersion", EINVOICE_REGIME_VERSIONS[0] ?? ""),
    refundInvoicing: stored.refundInvoicing === "adjustment" ? "adjustment" : "none",
  };
}

/**
 * The profile to send, or which fields the contract refuses (the regime's own template
 * symbol rule included), so each error sits under its field before anything is sent.
 */
export function checkEInvoiceProfileDraft(draft: EInvoiceProfileDraft): EInvoiceProfileCheck {
  const parsed = einvoiceProfileSchema.safeParse({
    ...draft,
    sellerTaxCode: draft.sellerTaxCode.trim(),
    templateSymbol: draft.templateSymbol.trim().toUpperCase(),
    provider: draft.provider.trim(),
  });
  if (parsed.success) return { ok: true, value: parsed.data };
  const errors: Partial<Record<EInvoiceProfileField, true>> = {};
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0]);
    if (FIELDS.includes(field)) errors[field as EInvoiceProfileField] = true;
  }
  return { ok: false, errors };
}
