import { pairDevice } from "@fnb/api/test-support/paired-devices";
import { newId } from "@fnb/db";
import { type Held, whatTheTillHolds } from "../../../../apps/pos/src/app/revoked-till-holdings";
import {
  type HttpSend,
  SyncTransportError,
  createHttpSyncTransport,
  flushOutboxUnderGrant,
} from "../../src";
import { amountDueOf } from "../support/order-amount-due";
import { pay, saveDraft } from "../support/order-commands";
import type { DayContext } from "./day-context";
import { closeShiftCounting, openShiftWith } from "./sim-commands";
import { type SimDevice, openTill, signIn } from "./simulated-shop";

/** The spare counter: paired at the incident, revoked, paired again under the same name. */
export const SPARE_TILL = "counter-3";
const OPENING_CASH = 500_000;

/**
 * How the send-the-rest goes on a given day: cut off by the network after the first hundred
 * commands and resumed with the same code; a code that expired before it was typed, then a
 * new one; or a payment the cashier tapped twice, refused and listed with its amount.
 */
export type FlushVariant = "halfway" | "expired" | "tapped_twice";

/**
 * How the revoked till's shift ends: its cashier counted and closed it offline before the till
 * learnt it was revoked, so the close goes up with the rest; nobody closed it, so a manager
 * closes it on the till's behalf once the till has sent the rest (as the backoffice says to);
 * or the cashier closed it offline and a manager, not waiting for the till, closed it on its
 * behalf first, so the till's sales arrive after that close and its own close is refused.
 */
export type ShiftEnd = "cashier_closed" | "on_behalf_after_flush" | "on_behalf_before_flush";

/** What a manager's close on the till's behalf answered. */
export interface ClosedOnBehalf {
  readonly counted: number;
  readonly expectedCash: number;
  readonly difference: number;
}

/** A cash payment the revoked till took, and the command that carried it. */
export interface RevokedPayment {
  readonly orderId: string;
  readonly commandId: string;
  readonly amount: number;
  /** The second tap of a payment already taken: the server is meant to refuse it. */
  readonly duplicate: boolean;
}

/** What the shop knows of its revoked till, for the end of the day. */
export interface RevokedTillBook {
  readonly variant: FlushVariant;
  readonly shiftEnd: ShiftEnd;
  deviceId: string;
  /** The shift the till was revoked in. */
  shiftId: string | null;
  /** The till's own close, when its cashier made one. */
  tillCloseId: string | null;
  closedOnBehalf: ClosedOnBehalf | null;
  readonly payments: RevokedPayment[];
  /** What the till said when it came back: the code of its first refused sync. */
  sawRevoked: string | null;
  /** Codes issued by the manager, and how each failed flush ended. */
  grants: number;
  readonly stops: string[];
  /** What the revoked screen listed once the outbox was empty, before pairing again. */
  held: Held | null;
  pendingAfterFlush: number | null;
}

const backoffice = async (ctx: DayContext, url: string, payload?: Record<string, unknown>) =>
  ctx.shop.server.backoffice({
    method: "POST",
    url,
    cookie: ctx.shop.shop.shop.managerCookie,
    ...(url.endsWith("flush-grants") ? { payload: {} } : {}),
    ...(payload === undefined ? {} : { payload }),
  });

/**
 * A manager on the day close page: finds the revoked till's shift among the open ones, counts
 * its drawer and closes it on the till's behalf against the figure the page shows.
 */
async function closeOnBehalf(ctx: DayContext, book: RevokedTillBook, counted: number): Promise<void> {
  const cookie = ctx.shop.shop.shop.managerCookie;
  const status = await ctx.shop.server.backoffice({
    method: "GET",
    url: `/branches/${ctx.shop.shop.shop.branchId}/day-close?businessDate=${ctx.window.businessDate}`,
    cookie,
  });
  const open = (JSON.parse(status.body) as { openShifts: { id: string; version: number; deviceRevoked: boolean }[] })
    .openShifts.find((shift) => shift.id === book.shiftId);
  if (open === undefined || !open.deviceRevoked)
    throw new Error(`the day close page does not offer to close ${book.shiftId}: ${status.body.slice(0, 300)}`);
  const answer = await backoffice(ctx, `/shifts/${open.id}/close-on-behalf`, {
    countedCash: counted,
    version: open.version,
  });
  if (answer.status !== 200) throw new Error(`closing on behalf answered ${answer.status} ${answer.body}`);
  const closed = JSON.parse(answer.body) as { expectedCash: number; difference: number };
  book.closedOnBehalf = { counted, expectedCash: closed.expectedCash, difference: closed.difference };
  const booked = ctx.books.shifts.find((shift) => shift.shiftId === book.shiftId);
  if (booked !== undefined) booked.counted = counted;
}

/** A till of the shop's branch, standing with the cashier, on a fresh database. */
async function pairedTill(ctx: DayContext, name: string, index: number): Promise<SimDevice> {
  const { shop } = ctx;
  const paired = await pairDevice(
    shop.server.api,
    shop.shop.shop.managerCookie,
    shop.shop.shop.branchId,
    "Quầy dự phòng",
  );
  const cashier = shop.devices.find((device) => !device.staff.manager)?.staff;
  const first = shop.devices[0];
  if (cashier === undefined || first === undefined) throw new Error("the shop has no cashier");
  const device: SimDevice = {
    name,
    role: "counter",
    record: {
      deviceId: paired.deviceId,
      deviceToken: paired.deviceToken,
      staffToken: "",
      staffId: cashier.id,
      nextSeq: 1,
      nextOrderNo: 1,
    },
    seed: first.seed + 50 + index,
    faults: first.faults,
    batchSize: 20,
    till: undefined as never,
    skewMs: 0,
    posBuild: first.posBuild,
    lastOrderNo: 0,
    shiftId: null,
    staff: cashier,
    drawer: 0,
  };
  device.till = openTill(shop, device);
  await signIn(shop, device);
  return device;
}

async function openDrawer(ctx: DayContext, device: SimDevice): Promise<void> {
  const shiftId = newId();
  await ctx.send(device, openShiftWith(shiftId, OPENING_CASH));
  device.shiftId = shiftId;
  device.drawer = OPENING_CASH;
  ctx.books.shifts.push({ device: device.name, shiftId, opening: OPENING_CASH, counted: null });
}

/**
 * A cash payment naming the shift the till was in when it took the money, as the app's
 * payment does: closed by the time it syncs, the sale still belongs to that shift's drawer.
 */
function payInto(device: SimDevice, view: Parameters<typeof pay>[0], amount: number) {
  const command = pay(view, amount);
  if (device.shiftId === null) return command;
  return { ...command, payload: { ...(command.payload as object), shiftId: device.shiftId } };
}

/** A customer pays cash for what the offline till shows; a cashier sometimes taps pay twice. */
async function offlineCashSale(
  ctx: DayContext,
  device: SimDevice,
  book: RevokedTillBook,
  tapTwice: boolean,
): Promise<void> {
  const items = Array.from({ length: ctx.random.int(1, 2) }, () => ctx.item());
  const order = ctx.books.open({
    id: newId(),
    openedBy: device.name,
    deviceOrderNo: ctx.nextOrderNo(device),
    kind: "counter",
    tableId: null,
    items: new Map(
      items.map((item) => [item.lineId, { productId: item.productId, quantity: item.quantity }]),
    ),
  });
  await ctx.send(
    device,
    saveDraft({ id: order.id, deviceOrderNo: order.deviceOrderNo, base: null }, items),
  );
  const view = await ctx.shown(device, order.id);
  if (view === null) throw new Error(`${device.name} shows no order ${order.id}`);
  const amount = amountDueOf(view);
  const taken = await ctx.send(device, payInto(device, view, amount));
  book.payments.push({ orderId: order.id, commandId: taken.commandId, amount, duplicate: false });
  if (tapTwice) {
    const again = await ctx.send(device, payInto(device, view, amount));
    ctx.books.meantToBeRefused.add(again.commandId);
    book.payments.push({ orderId: order.id, commandId: again.commandId, amount, duplicate: true });
  }
  device.drawer += amount;
  order.amountDue = amount;
  order.method = "cash";
  order.paidOn = device.name;
  ctx.books.settle(order, "paid");
}

/** The network the revoked till flushes over; on the halfway day it drops the second request once. */
function flushSend(device: SimDevice, book: RevokedTillBook): HttpSend {
  let flushes = 0;
  return async (request) => {
    if (request.path === "/sync/revoked-flush") {
      flushes += 1;
      if (book.variant === "halfway" && flushes === 2) throw new Error("the network dropped");
    }
    return device.till.network.send(request);
  };
}

/**
 * The spare counter's day: paired and opened, it goes offline and keeps selling for cash,
 * the owner revokes it from the backoffice meanwhile, the cashier counts and closes the
 * drawer. Back online the till finds itself revoked; a manager gives a send-the-rest code and
 * the till flushes its outbox as its revoked screen does, then is paired again as a new
 * device and opens a new drawer. False: not the moment yet (try again next round).
 */
export function scheduleRevokedTill(ctx: DayContext, atMs: number): RevokedTillBook | null {
  if (ctx.shop.devices.some((device) => device.name === SPARE_TILL)) return null;
  const variant = ctx.random.pick(["halfway", "expired", "tapped_twice"] as const);
  const shiftEnd = ctx.random.pick([
    "cashier_closed",
    "on_behalf_after_flush",
    "on_behalf_before_flush",
  ] as const);
  const book: RevokedTillBook = {
    variant,
    shiftEnd,
    deviceId: "",
    shiftId: null,
    tillCloseId: null,
    closedOnBehalf: null,
    payments: [],
    sawRevoked: null,
    grants: 0,
    stops: [],
    held: null,
    pendingAfterFlush: null,
  };
  let old: SimDevice | null = null;
  let code: string | null = null;
  let grantedAt = 0;

  const grant = async (): Promise<boolean> => {
    const answer = await backoffice(ctx, `/devices/${book.deviceId}/flush-grants`);
    if (answer.status !== 201)
      throw new Error(`the flush grant answered ${answer.status} ${answer.body}`);
    code = (JSON.parse(answer.body) as { code: string }).code;
    grantedAt = ctx.now();
    book.grants += 1;
    return true;
  };

  const flush = async (): Promise<boolean> => {
    const till = old;
    if (till === null || code === null) return false;
    // The manager is slow to the till: the code has run out by the time it is typed.
    if (variant === "expired" && book.grants === 1 && ctx.now() - grantedAt < 11 * 60_000)
      return false;
    const transport = createHttpSyncTransport({
      send: flushSend(till, book),
      deviceToken: till.record.deviceToken,
      staffSessionToken: () => till.record.staffToken,
      posBuild: till.posBuild,
    });
    const outcome = await flushOutboxUnderGrant(till.till.store, transport, code, () =>
      new Date(ctx.now() + till.skewMs).toISOString(),
    );
    if (outcome.kind === "failed") {
      const { error } = outcome;
      book.stops.push(
        `${error.kind}${error.status === null ? "" : ` ${error.status}`} after ${outcome.accepted}`,
      );
      // A code the server no longer takes: the manager gives another.
      if (error instanceof SyncTransportError && error.status === 401) await grant();
      return false;
    }
    book.pendingAfterFlush = await till.till.client.pendingCount();
    book.held = await whatTheTillHolds(till.till.store);
    // As the backoffice says: the till has sent the rest, now its shift is closed for it.
    if (shiftEnd === "on_behalf_after_flush") await closeOnBehalf(ctx, book, till.drawer);
    ctx.books.retiredTills.push(till.record);
    // "Ghép lại máy": the till forgets everything and is paired as a new device.
    await till.till.store.wipe();
    await till.till.close();
    const fresh = await pairedTill(ctx, SPARE_TILL, 1);
    ctx.shop.devices.push(fresh);
    await openDrawer(ctx, fresh);
    return true;
  };

  ctx.tasks.push({
    label: "a spare till is revoked while it holds sales",
    dueMs: atMs,
    run: async () => {
      const device = await pairedTill(ctx, SPARE_TILL, 0);
      old = device;
      book.deviceId = device.record.deviceId;
      await openDrawer(ctx, device);
      await device.till.syncUntilIdle();
      device.till.network.online = false;
      const sales = variant === "halfway" ? 52 : ctx.random.int(3, 6);
      const twice = variant === "tapped_twice" ? ctx.random.int(0, sales - 1) : -1;
      for (let sale = 0; sale < sales; sale += 1)
        await offlineCashSale(ctx, device, book, sale === twice);
      const revoked = await backoffice(ctx, `/devices/${book.deviceId}/revoke`);
      if (revoked.status !== 204) throw new Error(`revoking answered ${revoked.status}`);
      book.shiftId = device.shiftId;
      // The cashier counts the drawer and closes the shift, still offline, unless nobody got to it.
      const shiftId = device.shiftId;
      if (shiftId !== null && shiftEnd !== "on_behalf_after_flush") {
        const close = await ctx.send(device, closeShiftCounting(shiftId, device.drawer));
        book.tillCloseId = close.commandId;
        const booked = ctx.books.shifts.find((shift) => shift.shiftId === shiftId);
        if (booked !== undefined) booked.counted = device.drawer;
        device.shiftId = null;
      }
      // A manager closes the shift from the backoffice before the till has sent anything: the
      // till's sales then arrive after that close, and its own close is refused.
      if (shiftEnd === "on_behalf_before_flush") {
        if (book.tillCloseId !== null) ctx.books.meantToBeRefused.add(book.tillCloseId);
        await closeOnBehalf(ctx, book, device.drawer);
      }
      device.till.network.online = true;
      // The till finds out at its next pass that reaches the server (a backoff may delay it).
      ctx.tasks.push({
        label: "the revoked till sees itself revoked",
        dueMs: ctx.now(),
        run: async () => {
          const { failure } = await device.till.client.syncOnce();
          if (failure === null || failure.kind === "network") return false;
          book.sawRevoked = failure.code ?? `${failure.kind} ${failure.status}`;
          await grant();
          ctx.tasks.push({
            label: "the revoked till sends the rest",
            dueMs: ctx.now(),
            run: flush,
          });
          return true;
        },
      });
      return true;
    },
  });
  return book;
}
