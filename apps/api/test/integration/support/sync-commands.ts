import { newId } from "@fnb/db";
import { DOMAIN_VERSION } from "@fnb/domain";
import type { FastifyInstance } from "fastify";
import type {
  OrderSnapshot,
  SyncChange,
  SyncChangesPage,
  SyncCommandEnvelope,
  SyncCommandResult,
} from "../../../src/sync/sync-wire-types";
import type { Till } from "./sync-shop";

export const BUSINESS_DATE = "2026-10-20";
/** 10:00 in Vietnam: no time-limited price applies. */
export const RECORDED_AT = "2026-10-20T03:00:00.000Z";

export interface LineIntent {
  lineId: string;
  productId: string;
  variantId: string | null;
  modifiers: { groupId: string; optionId: string; quantity: number }[];
  quantity: string;
  note: string | null;
  /** Sent by some tills for display; the server must never read it. */
  unitPrice?: number;
}

export const line = (productId: string, overrides: Partial<LineIntent> = {}): LineIntent => ({
  lineId: newId(),
  productId,
  variantId: null,
  modifiers: [],
  quantity: "1",
  note: null,
  ...overrides,
});

/** The next command of `till`, numbered as its outbox would number it. */
export function command(
  till: Till,
  type: string,
  payload: unknown,
  overrides: Partial<SyncCommandEnvelope> = {},
): SyncCommandEnvelope {
  return {
    commandId: newId(),
    deviceSeq: till.nextSeq++,
    type,
    payload,
    businessDate: BUSINESS_DATE,
    domainVersion: DOMAIN_VERSION,
    createdAt: RECORDED_AT,
    ...overrides,
  };
}

export function saveDraft(
  till: Till,
  lines: LineIntent[],
  order: { orderId?: string; channelKey?: string | null; deviceOrderNo?: number } = {},
) {
  return command(till, "order.save_draft", {
    orderId: order.orderId ?? newId(),
    deviceOrderNo: order.deviceOrderNo ?? till.nextOrderNo++,
    serviceType: "takeaway",
    channelKey: order.channelKey ?? null,
    lines,
  });
}

export function pay(till: Till, orderId: string, amountDue: number, paid = amountDue) {
  return command(till, "order.pay", {
    orderId,
    payments: [{ method: "cash", amount: paid }],
    expectedAmountDue: amountDue,
  });
}

/** The order a save_draft command is about. */
export const orderIdOf = (sent: SyncCommandEnvelope): string =>
  (sent.payload as { orderId: string }).orderId;

export async function push(app: FastifyInstance, till: Till, commands: SyncCommandEnvelope[]) {
  const response = await app.inject({
    method: "POST",
    url: "/sync/commands",
    headers: { authorization: `Device ${till.deviceToken}`, "x-staff-session": till.staffToken },
    payload: { commands },
  });
  if (response.statusCode !== 200) {
    throw new Error(`push answered ${response.statusCode}: ${response.body}`);
  }
  return response.json().results as SyncCommandResult<OrderSnapshot>[];
}

/** Pushes one command and returns its result. */
export async function pushOne(app: FastifyInstance, till: Till, sent: SyncCommandEnvelope) {
  const [result] = await push(app, till, [sent]);
  if (result === undefined) throw new Error("no result for the command");
  return result;
}

export async function pull(app: FastifyInstance, till: Till, cursor: string, limit = 500) {
  const response = await app.inject({
    method: "GET",
    url: `/sync/changes?cursor=${cursor}&limit=${limit}`,
    headers: { authorization: `Device ${till.deviceToken}` },
  });
  if (response.statusCode !== 200) {
    throw new Error(`pull answered ${response.statusCode}: ${response.body}`);
  }
  return response.json() as SyncChangesPage;
}

/** Every change after `cursor`, page by page, as a till pulls until a page comes back empty. */
export async function pullAll(app: FastifyInstance, till: Till, cursor = "0", limit = 500) {
  const changes: SyncChange[] = [];
  let next = cursor;
  for (;;) {
    const page = await pull(app, till, next, limit);
    if (page.changes.length === 0) return { changes, cursor: next };
    changes.push(...page.changes);
    next = page.nextCursor;
  }
}

/** The latest snapshot of each order in `changes`, keyed by order id, as a till would hold it. */
export function latestOrders(changes: readonly SyncChange[]): Map<string, OrderSnapshot> {
  const orders = new Map<string, OrderSnapshot>();
  for (const change of changes) {
    if (change.entity === "order") orders.set(change.entityId, change.snapshot as OrderSnapshot);
  }
  return orders;
}
