/**
 * Electronic invoices from the cash register, issued through an invoice provider (VNPT,
 * Viettel, MISA, BKAV…), and the day's invoices sent on to the tax authority.
 *
 * LEGAL WARNING: the rules this module follows come from secondary sources (accounting
 * software blogs on Decree 254/2026 and Circular 91/2026), not yet checked against the
 * official text with the shop's tax accountant. Every rule that depends on the law is
 * looked up by the invoice's regime version (EINVOICE_REGIMES in @fnb/contracts) instead
 * of being written here, and no effective date is written anywhere: a branch changes
 * regime by changing its profile. No real provider adapter exists yet; one is written
 * against the provider's sandbox and must pass the same contract test as the fake.
 */
import type { EInvoiceBuyer } from "@fnb/contracts";
import type { BasisPoints, Vnd } from "@fnb/domain";

/** The seller as the branch's profile named it when the sale was paid. */
export interface EInvoiceSeller {
  readonly taxCode: string;
  readonly name: string;
  readonly address: string;
  readonly templateSymbol: string;
}

/** One goods line of the invoice, as the order's totals priced it. */
export interface EInvoiceLine {
  readonly name: string;
  /** Units actually sold (a voided unit is not), as a decimal string such as "1.5". */
  readonly quantity: string;
  readonly unitPrice: Vnd;
  readonly taxRate: BasisPoints;
  readonly gross: Vnd;
  readonly discount: Vnd;
  readonly net: Vnd;
  readonly tax: Vnd;
}

/** The amounts of the invoice, every one taken from the domain's computeOrderTotals. */
export interface EInvoiceAmounts {
  readonly lines: readonly EInvoiceLine[];
  readonly grossTotal: Vnd;
  readonly discountTotal: Vnd;
  readonly netTotal: Vnd;
  readonly serviceCharge: Vnd;
  readonly serviceChargeTax: Vnd;
  readonly taxBreakdown: readonly { rate: BasisPoints; base: Vnd; tax: Vnd }[];
  readonly taxTotal: Vnd;
  readonly amountDue: Vnd;
}

export interface EInvoiceDocument {
  /**
   * Our id for the invoice, which an adapter must pass as the provider's idempotency key:
   * when an answer is lost and the same invoice is sent again, the provider must answer
   * the invoice it already issued, never issue a second one for the same sale.
   */
  readonly id: string;
  readonly kind: "sale" | "adjustment";
  /** For an adjustment, the invoice it adjusts. */
  readonly adjusts: { readonly number: string; readonly templateSymbol: string } | null;
  readonly regimeVersion: string;
  readonly seller: EInvoiceSeller;
  /** Null for a retail customer who asked for nothing on the invoice. */
  readonly buyer: EInvoiceBuyer | null;
  /** When the till took the money, by its clock: the moment the invoice is dated. */
  readonly soldAt: Date;
  readonly businessDate: string;
  readonly amounts: EInvoiceAmounts;
}

/**
 * A refusal: "temporary" (provider down, timeout, rate limit) is tried again later;
 * "permanent" (the provider rejected the content) never will succeed as it stands and
 * needs a person. `code` is the provider's reason, kept for that person.
 */
export interface ProviderFailure {
  readonly ok: false;
  readonly failure: "temporary" | "permanent";
  readonly code: string;
}

export interface IssuedInvoice {
  readonly ok: true;
  readonly number: string;
  /** The tax authority's code for the invoice, when the regime gives one. */
  readonly taxAuthorityCode: string | null;
  /** What the customer types (or scans) on the provider's lookup page. */
  readonly lookupCode: string;
  readonly lookupUrl: string;
}

/** The issued invoices of one branch and business day, sent on as the regime asks. */
export interface DailyBatch {
  readonly id: string;
  readonly branchId: string;
  readonly businessDate: string;
  readonly regimeVersion: string;
  readonly seller: Omit<EInvoiceSeller, "templateSymbol">;
  readonly invoices: readonly {
    readonly id: string;
    readonly number: string;
    readonly templateSymbol: string;
    readonly taxAuthorityCode: string | null;
    readonly soldAt: Date;
    readonly amountDue: Vnd;
    readonly taxTotal: Vnd;
  }[];
}

export interface SubmittedBatch {
  readonly ok: true;
  /** The provider's (or tax authority's) receipt for the batch. */
  readonly reference: string;
}

export type LookupResult = { readonly found: false } | (IssuedInvoice & { readonly found: true });

/**
 * How a call is made. `signal` aborts when the worker gives the call up, a little before
 * the row's lease ends: an adapter hands it to its HTTP client and settles soon after it
 * fires (rejecting is fine), since past the lease another worker may send the same row.
 */
export interface ProviderCall {
  readonly signal?: AbortSignal;
}

export interface EInvoiceProvider {
  /** The key a branch's profile names it by. */
  readonly key: string;
  issue(document: EInvoiceDocument, call?: ProviderCall): Promise<IssuedInvoice | ProviderFailure>;
  submitDailyBatch(
    batch: DailyBatch,
    call?: ProviderCall,
  ): Promise<SubmittedBatch | ProviderFailure>;
  /** What the provider holds under our invoice id, to recover an answer that was lost. */
  lookup(documentId: string, call?: ProviderCall): Promise<LookupResult | ProviderFailure>;
}

/** The providers by key; two of one key are a wiring bug, so they fail at startup. */
export function providersByKey(
  providers: readonly EInvoiceProvider[],
): ReadonlyMap<string, EInvoiceProvider> {
  const byKey = new Map<string, EInvoiceProvider>();
  for (const provider of providers) {
    if (byKey.has(provider.key))
      throw new Error(`einvoice provider defined twice: ${provider.key}`);
    byKey.set(provider.key, provider);
  }
  return byKey;
}
