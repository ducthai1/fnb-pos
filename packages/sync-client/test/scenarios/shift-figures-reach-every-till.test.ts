import type { SyncShop } from "@fnb/api/test-support/sync-shop";
import { newId } from "@fnb/db";
import { DOMAIN_VERSION } from "@fnb/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LocalCommand } from "../../src";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import {
  BUSINESS_DATE,
  RECORDED_AT,
  orderOf,
  pay,
  pick,
  saveDraft,
} from "../support/order-commands";
import { ScenarioServer } from "../support/scenario-server";
import { ScenarioTill } from "../support/scenario-till";
import { virtualClock } from "../support/virtual-clock";

// On a real disk under the package (see scratchDirectory): the tills' writes fsync.
const dir = scratchDirectory("shift-figures");
let server: ScenarioServer;
let shop: SyncShop;
/**
 * Two tills of one branch, each the drawer of a shift in one test and the other till of
 * the branch in the other, so neither test inherits the other's open shift.
 */
let tillA: ScenarioTill;
let tillB: ScenarioTill;

beforeAll(async () => {
  // These scenarios open the tills' shifts themselves.
  ({ server, shop } = await ScenarioServer.withShop(undefined, { openShifts: false }));
  const clock = virtualClock().clock;
  tillA = new ScenarioTill(server.send, shop.tillA, {
    dir: dir.path,
    name: "till-a",
    seed: 31,
    clock,
  });
  tillB = new ScenarioTill(server.send, shop.tillB, {
    dir: dir.path,
    name: "till-b",
    seed: 41,
    clock,
  });
});

afterAll(async () => {
  await tillA.close();
  await tillB.close();
  await server.close();
  dir.remove();
});

/** The notes a cashier counts for 100.000 đ steps: one 100.000 note each. */
const notes = (amount: number) => [{ denomination: 100_000, pieces: amount / 100_000 }];

/** A shift command, shown at once as `shown` on the till that records it. */
function shiftCommand(
  type: string,
  shiftId: string,
  payload: Record<string, unknown>,
  shown: Record<string, unknown>,
): LocalCommand {
  return {
    commandId: newId(),
    type,
    payload,
    businessDate: BUSINESS_DATE,
    domainVersion: DOMAIN_VERSION,
    createdAt: RECORDED_AT,
    target: { entity: "shift", entityId: shiftId, optimistic: { id: shiftId, ...shown } },
  };
}

const shiftShownOn = async (till: ScenarioTill, shiftId: string) =>
  (await till.client.snapshot("shift", shiftId))?.snapshot as
    | {
        status: string;
        figures: { expectedCash: number; cashOut: number };
        close: { expectedCash: number; difference: number } | null;
        cashRecordedAfterClose: number;
      }
    | undefined;

async function openShift(drawer: ScenarioTill, openingCash: number) {
  const shiftId = newId();
  const payload = { shiftId, openingCash, denominations: notes(openingCash) };
  await drawer.client.enqueue(shiftCommand("shift.open", shiftId, payload, { status: "open" }));
  await drawer.syncUntilIdle();
  return shiftId;
}

async function closeShift(drawer: ScenarioTill, shiftId: string, counted: number) {
  const payload = { counted, denominations: notes(counted) };
  await drawer.client.enqueue(shiftCommand("shift.close", shiftId, payload, { status: "closed" }));
  const reports = await drawer.syncUntilIdle();
  expect(reports.flatMap((report) => report.rejected)).toEqual([]);
}

describe("a shift's figures on the tills of its branch", () => {
  it("follow a cash move, on the till that made it and on the one that pulls it", async () => {
    const [drawer, other] = [tillA, tillB];
    const shiftId = await openShift(drawer, 200_000);
    await other.syncUntilIdle();
    expect((await shiftShownOn(other, shiftId))?.figures.expectedCash).toBe(200_000);

    const move = { cashMoveId: newId(), kind: "out", amount: 100_000, reason: "Trả tiền đá" };
    await drawer.client.enqueue(shiftCommand("shift.cash_move", shiftId, move, {}));
    await drawer.syncUntilIdle();
    expect((await shiftShownOn(drawer, shiftId))?.figures).toMatchObject({
      cashOut: 100_000,
      expectedCash: 100_000,
    });
    await other.syncUntilIdle();
    expect((await shiftShownOn(other, shiftId))?.figures.expectedCash).toBe(100_000);

    await closeShift(drawer, shiftId, 100_000);
    await other.syncUntilIdle();
    expect(await shiftShownOn(other, shiftId)).toMatchObject({
      status: "closed",
      close: { expectedCash: 100_000, difference: 0 },
    });
  });

  it("show cash that reached the server after the close beside the close, on every till", async () => {
    const [drawer, handheld] = [tillB, tillA];
    const shiftId = await openShift(drawer, 300_000);
    const orderId = newId();
    await handheld.client.enqueue(
      saveDraft({ id: orderId, deviceOrderNo: 1, base: null }, [pick(shop.menu.coffee.id, 29_000)]),
    );
    await handheld.syncUntilIdle();
    // The handheld took the cash offline; the drawer's till closed on a count without it.
    await closeShift(drawer, shiftId, 300_000);
    await handheld.syncUntilIdle();
    expect(await shiftShownOn(handheld, shiftId)).toMatchObject({
      status: "closed",
      cashRecordedAfterClose: 0,
    });

    const order = orderOf(await handheld.client.snapshot("order", orderId));
    if (order === null) throw new Error("the handheld shows no draft");
    const paid = pay(order, 29_000);
    await handheld.client.enqueue({ ...paid, payload: { ...paid.payload, shiftId } });
    const reports = await handheld.syncUntilIdle();
    expect(reports.flatMap((report) => report.rejected)).toEqual([]);
    for (const till of [handheld, drawer]) {
      await till.syncUntilIdle();
      expect(await shiftShownOn(till, shiftId)).toMatchObject({
        cashRecordedAfterClose: 29_000,
        close: { expectedCash: 300_000, difference: 0 },
      });
    }
  });
});
