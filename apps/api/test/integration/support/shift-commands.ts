import { newId, withTenant } from "@fnb/db";
import { VND_DENOMINATIONS } from "@fnb/domain/shift";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import type { ShiftSnapshot } from "../../../src/sync/shift-wire-types";
import type { SyncCommandResult } from "../../../src/sync/sync-wire-types";
import { requestApproval } from "./approval-requests";
import { pairDevice } from "./paired-devices";
import { startShift } from "./staffed-shop";
import { justNow } from "./sync-approvals";
import { command, line, orderIdOf, push, pushOne, saveDraft } from "./sync-commands";
import type { SyncShop, Till } from "./sync-shop";

/** The PIN syncShop gives its cashier. */
export const CASHIER_PIN = "4826";

/** A new till of the shop's first branch with `staffId` signed in, numbering from 1. */
export async function freshTill(
  app: FastifyInstance,
  s: SyncShop,
  staffId = s.tillA.staffId,
  pin = CASHIER_PIN,
): Promise<Till> {
  const paired = await pairDevice(app, s.shop.managerCookie, s.shop.branchId, "Quầy ca");
  const session = await startShift(app, paired.deviceToken, staffId, pin);
  if (session.status !== 201) throw new Error(`signing in answered ${session.status}`);
  const { deviceId, deviceToken } = paired;
  const staffToken = session.body.staffSessionToken as string;
  return { deviceId, deviceToken, staffToken, staffId, nextSeq: 1, nextOrderNo: 1 };
}

/** The notes a cashier would count for `amount`, largest first. */
export function notesFor(amount: number) {
  let left = BigInt(amount);
  const rows: { denomination: number; pieces: number }[] = [];
  for (const note of [...VND_DENOMINATIONS].reverse()) {
    const pieces = left / note;
    if (pieces > 0n) rows.push({ denomination: Number(note), pieces: Number(pieces) });
    left -= pieces * note;
  }
  if (left !== 0n) throw new Error(`${amount} is not a whole number of notes`);
  return rows;
}

export const openShift = (till: Till, openingCash: number, shiftId = newId()) =>
  command(till, "shift.open", { shiftId, openingCash, denominations: notesFor(openingCash) });

/**
 * Approvals are timed by the API's clock and honoured for ten minutes around when the till
 * recorded the command, so a command relying on one is dated right after it was given.
 */
const datedFor = (extra: { approvalId?: string }) =>
  extra.approvalId === undefined ? {} : { createdAt: justNow() };

export const closeShift = (till: Till, counted: number, extra: { approvalId?: string } = {}) =>
  command(
    till,
    "shift.close",
    { counted, denominations: notesFor(counted), ...extra },
    datedFor(extra),
  );

export const cashMove = (
  till: Till,
  kind: "in" | "out",
  amount: number,
  extra: { approvalId?: string } = {},
) =>
  command(
    till,
    "shift.cash_move",
    { cashMoveId: newId(), kind, amount, reason: "Trả tiền đá", ...extra },
    datedFor(extra),
  );

/** order.pay in cash, naming the shift the till was in when it took the money. */
export const payInShift = (till: Till, orderId: string, amount: number, shiftId?: string) =>
  command(till, "order.pay", {
    orderId,
    payments: [{ method: "cash", amount }],
    expectedAmountDue: amount,
    ...(shiftId === undefined ? {} : { shiftId }),
  });

/** Pushes a shift command and returns its result, typed with the shift it answers with. */
export async function pushShift(
  app: FastifyInstance,
  till: Till,
  sent: ReturnType<typeof command>,
): Promise<SyncCommandResult<ShiftSnapshot>> {
  const [result] = (await push(app, till, [sent])) as unknown as SyncCommandResult<ShiftSnapshot>[];
  if (result === undefined) throw new Error("no result for the command");
  return result;
}

/** Opens a shift on `till` and returns its id, failing the test if it was refused. */
export async function openedShift(app: FastifyInstance, till: Till, openingCash: number) {
  const result = await pushShift(app, till, openShift(till, openingCash));
  if (result.status !== "accepted") throw new Error(`shift.open answered ${result.code}`);
  return result.snapshot?.id ?? "";
}

/** A draft of one cà phê sữa (29.000 đ), pushed and accepted; returns the order id. */
export async function coffeeDraft(app: FastifyInstance, s: SyncShop, till: Till) {
  const sent = saveDraft(till, [line(s.menu.coffee.id)]);
  const result = await pushOne(app, till, sent);
  if (result.status !== "accepted") throw new Error(`save_draft answered ${result.code}`);
  return orderIdOf(sent);
}

/** An approval granted on `till` by `approverStaffId`, for the staff member signed in. */
export async function approval(
  app: FastifyInstance,
  till: Till,
  action: { key: string; amount?: string; difference?: string },
  approverStaffId: string,
  approverPin: string,
): Promise<string> {
  const answer = await requestApproval(app, till.deviceToken, till.staffToken, {
    action,
    approverStaffId,
    approverPin,
  });
  if (answer.status !== 201) throw new Error(`approval answered ${answer.status}`);
  return answer.body.approvalId as string;
}

/** Rows read as the app role inside the tenant, for asserting what was stored. */
export const rowsOf = (pool: pg.Pool, tenantId: string, sql: string, values: unknown[] = []) =>
  withTenant(pool, tenantId, async (client) => (await client.query(sql, values)).rows);
