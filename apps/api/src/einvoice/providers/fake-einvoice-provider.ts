import type {
  DailyBatch,
  EInvoiceDocument,
  EInvoiceProvider,
  IssuedInvoice,
  LookupResult,
  ProviderFailure,
  SubmittedBatch,
} from "../einvoice-provider";

export type FakeProviderOperation = "issue" | "submitDailyBatch" | "lookup";

/** One call the fake received, with what it was given. */
export type FakeProviderCall =
  | { readonly operation: "issue"; readonly document: EInvoiceDocument }
  | { readonly operation: "submitDailyBatch"; readonly batch: DailyBatch }
  | { readonly operation: "lookup"; readonly documentId: string };

interface QueuedFailure {
  readonly operation: FakeProviderOperation;
  readonly failure: Omit<ProviderFailure, "ok">;
  remaining: number;
}

/**
 * An invoice provider that keeps its invoices in memory, for tests and for running the
 * system without a provider's sandbox. It records every call, honours the idempotency key
 * (the same invoice id answers the same number), and can be told to fail: a few calls in a
 * row, temporarily or for good, or every call while it is "down" (answering, or throwing as
 * a dropped connection does).
 */
export class FakeEInvoiceProvider implements EInvoiceProvider {
  readonly calls: FakeProviderCall[] = [];
  private readonly issued = new Map<string, IssuedInvoice>();
  private readonly failures: QueuedFailure[] = [];
  private down: { code: string; throws: boolean } | null = null;
  private gate: Promise<void> | null = null;
  private lastNumber = 0;
  private lastBatch = 0;

  constructor(readonly key = "fake") {}

  /** The next `times` calls of `operation` fail as given; later ones behave again. */
  failNext(
    operation: FakeProviderOperation,
    failure: Omit<ProviderFailure, "ok">,
    times = 1,
  ): void {
    this.failures.push({ operation, failure, remaining: times });
  }

  /** Every call fails temporarily until comeBack(); `throws` drops it like a lost connection. */
  goDown(options: { code?: string; throws?: boolean } = {}): void {
    this.down = { code: options.code ?? "FAKE_PROVIDER_UNAVAILABLE", throws: options.throws ?? false };
  }

  comeBack(): void {
    this.down = null;
  }

  /**
   * Holds every call (recorded on arrival) until the returned release is called, as a slow
   * provider does, so a test can see what two workers have in flight at the same moment.
   */
  hold(): () => void {
    let release = () => {};
    this.gate = new Promise((resolve) => (release = resolve));
    return () => {
      this.gate = null;
      release();
    };
  }

  /** The calls of one operation, in the order they came. */
  callsOf<O extends FakeProviderOperation>(operation: O) {
    return this.calls.filter(
      (call): call is Extract<FakeProviderCall, { operation: O }> => call.operation === operation,
    );
  }

  async issue(document: EInvoiceDocument): Promise<IssuedInvoice | ProviderFailure> {
    this.calls.push({ operation: "issue", document });
    const refused = await this.refusal("issue");
    if (refused !== null) return refused;
    const known = this.issued.get(document.id);
    if (known !== undefined) return known;
    this.lastNumber += 1;
    const number = String(this.lastNumber).padStart(8, "0");
    const year = String(document.soldAt.getUTCFullYear() % 100).padStart(2, "0");
    const lookupCode = `FK${String(this.lastNumber).padStart(10, "0")}`;
    const invoice: IssuedInvoice = {
      ok: true,
      number,
      taxAuthorityCode: `M1-${year}-FAKE0-${String(this.lastNumber).padStart(11, "0")}`,
      lookupCode,
      lookupUrl: `https://einvoice.fake.test/lookup?code=${lookupCode}`,
    };
    this.issued.set(document.id, invoice);
    return invoice;
  }

  async submitDailyBatch(batch: DailyBatch): Promise<SubmittedBatch | ProviderFailure> {
    this.calls.push({ operation: "submitDailyBatch", batch });
    const refused = await this.refusal("submitDailyBatch");
    if (refused !== null) return refused;
    const unknown = batch.invoices.find((invoice) => !this.holdsNumber(invoice.number));
    if (unknown !== undefined) {
      return { ok: false, failure: "permanent", code: "FAKE_BATCH_NAMES_UNKNOWN_INVOICE" };
    }
    this.lastBatch += 1;
    return { ok: true, reference: `FAKE-BATCH-${String(this.lastBatch).padStart(6, "0")}` };
  }

  async lookup(documentId: string): Promise<LookupResult | ProviderFailure> {
    this.calls.push({ operation: "lookup", documentId });
    const refused = await this.refusal("lookup");
    if (refused !== null) return refused;
    const known = this.issued.get(documentId);
    return known === undefined ? { found: false } : { ...known, found: true };
  }

  private holdsNumber(number: string): boolean {
    for (const invoice of this.issued.values()) if (invoice.number === number) return true;
    return false;
  }

  private async refusal(operation: FakeProviderOperation): Promise<ProviderFailure | null> {
    if (this.gate !== null) await this.gate;
    if (this.down !== null) {
      if (this.down.throws) throw new Error("fake provider: connection reset");
      return { ok: false, failure: "temporary", code: this.down.code };
    }
    const queued = this.failures.find((f) => f.operation === operation && f.remaining > 0);
    if (queued === undefined) return null;
    queued.remaining -= 1;
    return { ok: false, ...queued.failure };
  }
}
