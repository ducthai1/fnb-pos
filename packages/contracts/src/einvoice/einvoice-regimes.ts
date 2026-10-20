/**
 * The invoice rules of each legal regime a branch can be set to, as data.
 *
 * LEGAL WARNING: the only regime below is read from secondary sources (accounting software
 * blogs about Decree 254/2026 and Circular 91/2026); nobody has checked it against the
 * official gazette yet. That is why every rule an invoice follows is looked up here by the
 * branch's `regimeVersion` instead of being written into the code, and why no regime
 * carries an effective date: a branch moves to a new regime when the shop changes its
 * profile, never because the server's clock passed a date someone typed in. When the text
 * is verified (or the rules change), add a new regime key; do not edit one invoices were
 * already issued under, since each invoice keeps the key it was issued with.
 */
export interface EInvoiceRegimeRules {
  /**
   * The template symbol ("ký hiệu") the regime asks for. For invoices printed from a cash
   * register the fourth character is M: 1 = VAT invoice, 2 = sales invoice; C = carries a
   * tax authority code; two digits of the year; M; two letters the seller picks.
   */
  readonly templateSymbol: RegExp;
  /** Whether the day's issued invoices must be sent to the tax authority as a batch. */
  readonly dailySubmission: boolean;
  /**
   * What a refund of an invoiced sale does: "none" books it without an invoice of its own
   * (cash register invoices are said to be neither adjusted nor cancelled), "adjustment"
   * issues an adjusting invoice. Which one the law wants is an open question for the
   * shop's accountant, so a regime lists what it allows and the profile picks.
   */
  readonly refundInvoicing: readonly RefundInvoicing[];
}

export type RefundInvoicing = "none" | "adjustment";

export const EINVOICE_REGIMES = {
  "nd254-tt91": {
    templateSymbol: /^[12]C\d{2}M[A-Z]{2}$/,
    dailySubmission: true,
    refundInvoicing: ["none", "adjustment"],
  },
} as const satisfies Record<string, EInvoiceRegimeRules>;

export type EInvoiceRegimeVersion = keyof typeof EINVOICE_REGIMES;

export const EINVOICE_REGIME_VERSIONS = Object.keys(EINVOICE_REGIMES) as EInvoiceRegimeVersion[];

/** The rules of a regime key, or undefined for one this build does not know. */
export function einvoiceRegimeRules(version: string): EInvoiceRegimeRules | undefined {
  return Object.hasOwn(EINVOICE_REGIMES, version)
    ? EINVOICE_REGIMES[version as EInvoiceRegimeVersion]
    : undefined;
}
