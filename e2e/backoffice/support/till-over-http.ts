import { newId } from "@fnb/db";
import { DOMAIN_VERSION, businessDate } from "@fnb/domain";
import { expect } from "vitest";
import { asOwner } from "./backoffice-in-browser";
import type { BackofficeStack } from "./global-setup-start-backoffice-stack";

/** A till of the stack's branch with a cashier signed in, numbering its commands itself. */
export interface TillOverHttp {
  readonly deviceId: string;
  readonly deviceToken: string;
  readonly staffToken: string;
  nextSeq: number;
}

/** The business day a sale made now belongs to, on the clock every new branch starts with. */
export const todayAtTheBranch = () => businessDate(Date.now(), { utcOffsetMinutes: 420, dayStartMinute: 240 });

const PIN = "4826";

async function api(stack: BackofficeStack, path: string, init: { method: string; headers?: Record<string, string>; body?: unknown }) {
  const response = await fetch(`${stack.apiOrigin}${path}`, {
    method: init.method,
    headers: { ...init.headers, ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> };
}

/**
 * A new till of the stack's branch, paired the way the POS pairs, with a new cashier
 * signed in on it: each spec that sells gets its own, so command numbers and the one open
 * shift a till may have never collide between specs sharing the stack.
 */
export async function pairedTillWithCashier(stack: BackofficeStack, tillName: string): Promise<TillOverHttp> {
  const code = await asOwner(stack, "POST", "/devices/pairing-codes", { branchId: stack.branchId });
  expect(code.status).toBe(201);
  const paired = await api(stack, "/devices/pair", {
    method: "POST",
    body: { code: (code.body as { code: string }).code, deviceName: tillName },
  });
  expect(paired.status).toBe(201);
  const roles = (await asOwner(stack, "GET", "/roles")).body as { roles: { id: string }[] };
  const hired = await asOwner(stack, "POST", "/staff", {
    displayName: "Thu ngân",
    roleId: roles.roles[0]?.id ?? "",
    pin: PIN,
    branchIds: [stack.branchId],
  });
  expect(hired.status).toBe(201);
  const deviceToken = String(paired.body.deviceToken);
  const session = await api(stack, "/pos/staff-sessions", {
    method: "POST",
    headers: { authorization: `Device ${deviceToken}` },
    body: { staffId: (hired.body as { staffId: string }).staffId, pin: PIN },
  });
  expect(session.status).toBe(201);
  return {
    deviceId: String(paired.body.deviceId),
    deviceToken,
    staffToken: String(session.body.staffSessionToken),
    nextSeq: 1,
  };
}

/** Pushes commands as the till's outbox would, and expects every one accepted. */
export async function pushAccepted(stack: BackofficeStack, till: TillOverHttp, commands: { type: string; payload: unknown }[]) {
  const envelopes = commands.map((command) => ({
    commandId: newId(),
    deviceSeq: till.nextSeq++,
    type: command.type,
    payload: command.payload,
    businessDate: todayAtTheBranch(),
    domainVersion: DOMAIN_VERSION,
    createdAt: new Date().toISOString(),
  }));
  const pushed = await api(stack, "/sync/commands", {
    method: "POST",
    headers: { authorization: `Device ${till.deviceToken}`, "x-staff-session": till.staffToken },
    body: { commands: envelopes },
  });
  expect(pushed.status).toBe(200);
  const results = pushed.body.results as { status: string; code?: string }[];
  expect(results.map((result) => result.status), JSON.stringify(results)).toEqual(commands.map(() => "accepted"));
}

/** The shift.open command of a drawer counted as one 500.000 đ note. */
export const openShift = (shiftId: string) => ({
  type: "shift.open",
  payload: { shiftId, openingCash: 500_000, denominations: [{ denomination: 500_000, pieces: 1 }] },
});

/** A takeaway order of one unit of `productId`, paid in cash at `amountDue`. */
export function soldInCash(productId: string, deviceOrderNo: number, amountDue: number) {
  const orderId = newId();
  return [
    {
      type: "order.save_draft",
      payload: {
        orderId,
        deviceOrderNo,
        serviceType: "takeaway",
        channelKey: null,
        lines: [{ lineId: newId(), productId, variantId: null, modifiers: [], quantity: "1", note: null }],
      },
    },
    {
      type: "order.pay",
      payload: { orderId, payments: [{ method: "cash", amount: amountDue }], expectedAmountDue: amountDue },
    },
  ];
}

/** What the till is sent at start: its settings, resolved for it by the server. */
export async function tillBootstrap(stack: BackofficeStack, deviceToken: string) {
  const answer = await api(stack, "/pos/bootstrap", { method: "GET", headers: { authorization: `Device ${deviceToken}` } });
  expect(answer.status).toBe(200);
  return answer.body as { config: { settings: Record<string, unknown> } };
}
