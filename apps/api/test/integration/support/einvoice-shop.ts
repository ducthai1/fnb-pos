import { randomBytes } from "node:crypto";
import { withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { buildApp } from "../../../src/build-app";
import { providersByKey } from "../../../src/einvoice/einvoice-provider";
import type { EInvoiceRetryPolicy } from "../../../src/einvoice/einvoice-retry-policy";
import {
  type EInvoiceWorkDependencies,
  runEInvoiceWorkForTenant,
  runEInvoiceWorkerOnce,
} from "../../../src/einvoice/einvoice-worker";
import { FakeEInvoiceProvider } from "../../../src/einvoice/providers/fake-einvoice-provider";
import { EINVOICE_PROFILE, saveEInvoiceProfile } from "./einvoice-profiles";
import { ManualClock } from "./manual-clock";
import { line, orderIdOf, pay, pushOne, saveDraft } from "./sync-commands";
import { type SyncShop, type Till, syncShop } from "./sync-shop";

/**
 * An API with a fake invoice provider of its own. The provider's key is new for every app:
 * test files share one database and run side by side, and a worker only takes work of the
 * providers it has, so a round here never touches another file's invoices.
 */
export interface InvoicingApi {
  app: FastifyInstance;
  clock: ManualClock;
  provider: FakeEInvoiceProvider;
  deps: EInvoiceWorkDependencies;
  /** One round of the worker over every tenant with work for this provider. */
  work(): Promise<Awaited<ReturnType<typeof runEInvoiceWorkerOnce>>>;
  /** The worker's work for one tenant, as a request that just queued something runs it. */
  workFor(tenantId: string): Promise<Awaited<ReturnType<typeof runEInvoiceWorkForTenant>>>;
}

export function invoicingApi(pool: pg.Pool, policy?: EInvoiceRetryPolicy): InvoicingApi {
  const clock = new ManualClock();
  const provider = new FakeEInvoiceProvider(`fake_${randomBytes(6).toString("hex")}`);
  const app = buildApp({ pool, clock, einvoiceProviders: [provider] });
  const deps = {
    pool,
    clock,
    providers: providersByKey([provider]),
    ...(policy ? { policy } : {}),
  };
  return {
    app,
    clock,
    provider,
    deps,
    work: () => runEInvoiceWorkerOnce(deps),
    workFor: (tenantId) => runEInvoiceWorkForTenant(deps, tenantId),
  };
}

/** A shop whose first branch invoices every sale through the API's fake provider. */
export async function invoicingShop(
  api: InvoicingApi,
  pool: pg.Pool,
  profile: Record<string, unknown> = {},
): Promise<SyncShop> {
  const s = await syncShop(api.app, pool);
  const value = { ...EINVOICE_PROFILE, provider: api.provider.key, ...profile };
  await saveEInvoiceProfile(
    pool,
    s.shop.tenantId,
    { scopeKind: "branch", scopeId: s.shop.branchId },
    value,
  );
  return s;
}

/** A 29.000đ coffee rung up and paid in cash; answers the order id. */
export async function paidCoffee(app: FastifyInstance, s: SyncShop, till: Till = s.tillA) {
  const draft = saveDraft(till, [line(s.menu.coffee.id)]);
  const saved = await pushOne(app, till, draft);
  if (saved.status !== "accepted") throw new Error(`draft ${saved.status}: ${saved.code}`);
  const paid = await pushOne(app, till, pay(till, orderIdOf(draft), 29_000));
  if (paid.status !== "accepted") throw new Error(`payment ${paid.status}: ${paid.code}`);
  return orderIdOf(draft);
}

export interface InvoiceRow {
  id: string;
  order_id: string;
  kind: string;
  adjusts_einvoice_id: string | null;
  status: string;
  attempts: number;
  next_attempt_at: Date | null;
  last_error_code: string | null;
  number: string | null;
  lookup_code: string | null;
  buyer: unknown;
  sold_at: Date;
  amounts: Record<string, unknown>;
}

/** The tenant's invoices, oldest first. */
export const invoicesOf = (pool: pg.Pool, tenantId: string) =>
  withTenant(pool, tenantId, async (client) => {
    const { rows } = await client.query<InvoiceRow>(
      "SELECT id, order_id, kind, adjusts_einvoice_id, status, attempts, next_attempt_at, " +
        "last_error_code, number, lookup_code, buyer, sold_at, amounts FROM einvoice " +
        "ORDER BY created_at, id",
    );
    return rows;
  });
