import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import type { SyncCommandEnvelope } from "../../../src/sync/sync-wire-types";
import { kitchenStation, sentToKitchen, ticketLine } from "../support/kitchen-commands";
import { rowsOf } from "../support/shift-commands";
import {
  type LineIntent,
  line,
  orderIdOf,
  pullAll,
  push,
  pushOne,
  saveDraft,
  tillsClock,
} from "../support/sync-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  s = await syncShop(app, pool);
});

/** The draft saved again from `till`, over the version it holds, with `lines` as it shows them. */
function saveAgain(
  till: Till,
  orderId: string,
  lines: LineIntent[],
  expectedVersion: number,
  extra: Record<string, unknown> = {},
): SyncCommandEnvelope {
  const sent = saveDraft(till, lines, { orderId, deviceOrderNo: 1 });
  return { ...sent, payload: { ...(sent.payload as object), expectedVersion, ...extra } };
}

const versionOf = async (orderId: string) =>
  (await rowsOf(pool, s.shop.tenantId, "SELECT version FROM sales_order WHERE id = $1", [orderId]))[0]
    ?.version as number;

/** Copies of the order in the feed after `cursor`. */
const feedCopies = async (orderId: string, cursor: string) =>
  (await pullAll(app, s.tillB, cursor)).changes.filter((change) => change.entityId === orderId);

const cursorNow = async () => (await pullAll(app, s.tillB)).cursor;

describe("saving a draft that changes nothing", () => {
  it("keeps the order's version and sends no new copy, while answering the order as it stands", async () => {
    const lines = [line(s.menu.coffee.id, { note: "ít đá" }), line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeL })];
    const first = saveDraft(s.tillA, lines);
    const orderId = orderIdOf(first);
    expect((await pushOne(app, s.tillA, first)).status).toBe("accepted");
    const cursor = await cursorNow();
    const again = await pushOne(app, s.tillA, saveAgain(s.tillA, orderId, lines, 1));
    expect(again.status).toBe("accepted");
    expect(again.snapshot).toMatchObject({ id: orderId, version: 1 });
    expect(await versionOf(orderId)).toBe(1);
    expect(await feedCopies(orderId, cursor)).toEqual([]);
    // Without a version to save over, the same.
    const unnamed = saveDraft(s.tillA, lines, { orderId, deviceOrderNo: 1 });
    expect((await pushOne(app, s.tillA, unnamed)).snapshot).toMatchObject({ version: 1 });
    expect(await feedCopies(orderId, cursor)).toEqual([]);
    // A real change still counts, once.
    const changed = await pushOne(app, s.tillA, saveAgain(s.tillA, orderId, [...lines, line(s.menu.coffee.id)], 1));
    expect(changed.snapshot).toMatchObject({ version: 2 });
    expect(await feedCopies(orderId, cursor)).toHaveLength(1);
  });

  it("does not make another till's save over the same version stale", async () => {
    const lines = [line(s.menu.coffee.id)];
    const first = saveDraft(s.tillA, lines);
    const orderId = orderIdOf(first);
    await pushOne(app, s.tillA, first);
    // Both tills hold version 1; the counter sends what it shows unchanged, the handheld adds a tea.
    const noOp = await pushOne(app, s.tillA, saveAgain(s.tillA, orderId, lines, 1));
    const added = await pushOne(app, s.tillB, saveAgain(s.tillB, orderId, [...lines, line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeM })], 1));
    expect([noOp.status, added.status]).toEqual(["accepted", "accepted"]);
    expect(added.snapshot).toMatchObject({ version: 2 });
    expect(added.snapshot?.lines).toHaveLength(2);
  });

  it("counts a header change, a moved line, a new note or a new quantity as a change", async () => {
    const coffee = line(s.menu.coffee.id);
    const tea = line(s.menu.peachTea.id, { variantId: s.menu.peachTea.sizeM });
    const first = saveDraft(s.tillA, [coffee, tea]);
    const orderId = orderIdOf(first);
    await pushOne(app, s.tillA, first);
    const variants: [string, LineIntent[], Record<string, unknown>][] = [
      ["a tag on the order, eaten in", [coffee, tea], { serviceType: "dine_in", tableTag: "Bàn ngoài hiên số 19" }],
      ["taken away again", [coffee, tea], {}],
      ["the lines swapped", [tea, coffee], {}],
      ["a note", [tea, { ...coffee, note: "không đường" }], {}],
      ["999 of a line", [tea, { ...coffee, note: "không đường", quantity: "999" }], {}],
    ];
    let version = 1;
    for (const [what, lines, extra] of variants) {
      const answer = await pushOne(app, s.tillA, saveAgain(s.tillA, orderId, lines, version, { tableTag: null, ...extra }));
      expect([what, answer.status, answer.code]).toEqual([what, "accepted", undefined]);
      version = answer.snapshot?.version ?? 0;
      // Each of these after the first must also leave the previous one untouched when resent.
      const repeat = await pushOne(app, s.tillA, saveAgain(s.tillA, orderId, lines, version, { tableTag: null, ...extra }));
      expect([what, repeat.snapshot?.version]).toEqual([what, version]);
    }
    expect(version).toBe(1 + variants.length);
  });

  it("keeps the version of a busy draft: options 999 times, a combo, a line sent to the bar", async () => {
    const bar = await kitchenStation(app, s);
    const { coffee, combo, peachTea } = s.menu;
    const lines = [
      line(coffee.id, {
        quantity: "999",
        note: "ítđườngnhiềuđákhôngđánhthêmtrânchâu".repeat(4),
        modifiers: [
          { groupId: coffee.extrasGroup, optionId: coffee.extraShot, quantity: 1 },
          { groupId: coffee.extrasGroup, optionId: coffee.saltedCream, quantity: 1 },
        ],
      }),
      line(combo.id, {
        comboPicks: [
          { slotId: combo.drinkSlot, productId: peachTea.id, variantId: peachTea.sizeL, modifiers: [] },
          { slotId: combo.extraSlot, productId: coffee.id, variantId: null, modifiers: [] },
        ],
      }),
    ];
    const first = saveDraft(s.tillA, lines);
    const orderId = orderIdOf(first);
    await pushOne(app, s.tillA, first);
    const sent = await pushOne(app, s.tillA, sentToKitchen(s.tillA, orderId, bar, [ticketLine(lines[0]!.lineId, "999")]));
    expect(sent.status).toBe("accepted");
    const held = sent.snapshot?.version ?? 0;
    const cursor = await cursorNow();
    const resent = await pushOne(app, s.tillA, saveAgain(s.tillA, orderId, lines, held));
    expect(resent.snapshot).toMatchObject({ version: held });
    expect(await feedCopies(orderId, cursor)).toEqual([]);
  });

  it("answers a resent no-op command what it answered the first time", async () => {
    const lines = [line(s.menu.coffee.id)];
    const first = saveDraft(s.tillA, lines);
    const orderId = orderIdOf(first);
    await pushOne(app, s.tillA, first);
    const noOp = saveAgain(s.tillA, orderId, lines, 1);
    const [answer] = await push(app, s.tillA, [noOp]);
    const [again] = await push(app, s.tillA, [noOp]);
    expect(again).toEqual(answer);
    expect(await versionOf(orderId)).toBe(1);
  });
});
