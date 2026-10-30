import { SYNC_FEATURES_HEADER, SYNC_FEATURE_SHIFT_VERSION } from "@fnb/contracts";
import { testConnectionString } from "@fnb/db/test-support";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { buildApp } from "../../../src/build-app";
import { cashMove } from "../support/shift-commands";
import { type SyncShop, type Till, syncShop } from "../support/sync-shop";
import {
  command,
  line,
  orderIdOf,
  pay,
  pullAll,
  pushOne,
  saveDraft,
  tillsClock,
} from "../support/sync-commands";
import { hireManager, signInAs } from "../support/sync-approvals";
import { refund } from "../support/sync-order-commands";

const info = inject("testPostgres");

let pool: pg.Pool;
let app: FastifyInstance;
let s: SyncShop;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(info, "app") });
  app = buildApp({ pool, clock: tillsClock() });
  s = await syncShop(app, pool);
  await hireManager(app, s);
  // Till B is the manager's: its refunds need nobody to approve them.
  await signInAs(app, s, s.tillB, "manager");
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

type Sent = ReturnType<typeof command>;
interface Answer {
  status: string;
  shiftVersion?: number;
  snapshot?: { version?: number };
}

/** Pushes one command as a till that says it understands `features`. */
async function pushAs(till: Till, sent: Sent, features: readonly string[]): Promise<Answer> {
  const response = await app.inject({
    method: "POST",
    url: "/sync/commands",
    headers: {
      authorization: `Device ${till.deviceToken}`,
      "x-staff-session": till.staffToken,
      ...(features.length === 0 ? {} : { [SYNC_FEATURES_HEADER]: features.join(", ") }),
    },
    payload: { commands: [sent] },
  });
  expect(response.statusCode).toBe(200);
  return response.json().results[0] as Answer;
}

const understood = [SYNC_FEATURE_SHIFT_VERSION];

/** The version of the till's shift as the change feed last carried it. */
async function feedVersionOfShift(till: Till): Promise<number> {
  const { changes } = await pullAll(app, till);
  const shifts = changes.filter(
    (change) => change.entity === "shift" && change.entityId === till.shiftId,
  );
  return Number((shifts.at(-1)?.snapshot as { version: number }).version);
}

async function draftOf(till: Till): Promise<{ orderId: string; due: number }> {
  const sent = saveDraft(till, [line(s.menu.coffee.id)]);
  expect((await pushOne(app, till, sent)).status).toBe("accepted");
  return { orderId: orderIdOf(sent), due: 29_000 };
}

describe("the answer to a command that puts cash into a shift's book", () => {
  it("carries the version the shift's copy reaches, for a cash payment", async () => {
    const { orderId, due } = await draftOf(s.tillA);
    const answer = await pushAs(s.tillA, pay(s.tillA, orderId, due), understood);
    expect(answer.status).toBe("accepted");
    expect(answer.shiftVersion).toBe(await feedVersionOfShift(s.tillA));
  });

  it("carries the version for a cash move, the same as the shift copy it answers with", async () => {
    const answer = await pushAs(s.tillA, cashMove(s.tillA, "in", 50_000), understood);
    expect(answer.status).toBe("accepted");
    expect(answer.shiftVersion).toBe(answer.snapshot?.version);
  });

  it("carries the version for a cash refund of a sale", async () => {
    const { orderId, due } = await draftOf(s.tillB);
    await pushAs(s.tillB, pay(s.tillB, orderId, due), understood);
    const sold = (await pullAll(app, s.tillB)).changes
      .filter((change) => change.entity === "order" && change.entityId === orderId)
      .at(-1)?.snapshot as { lines: { id: string }[] };
    const lineId = sold.lines[0]?.id ?? "";
    const answer = await pushAs(
      s.tillB,
      refund(s.tillB, orderId, [{ lineId, quantity: "1", restock: false }], -due),
      understood,
    );
    expect(answer.status).toBe("accepted");
    expect(answer.shiftVersion).toBe(await feedVersionOfShift(s.tillB));
  });

  it("is left out when no cash went into the book (a card payment)", async () => {
    const { orderId, due } = await draftOf(s.tillB);
    const card = command(s.tillB, "order.pay", {
      orderId,
      payments: [{ method: "card", amount: due }],
      expectedAmountDue: due,
    });
    const answer = await pushAs(s.tillB, card, understood);
    expect(answer.status).toBe("accepted");
    expect(answer).not.toHaveProperty("shiftVersion");
  });

  it("is left out of the answer to a till that did not ask (an older release parses it strictly)", async () => {
    const { orderId, due } = await draftOf(s.tillB);
    const answer = await pushAs(s.tillB, pay(s.tillB, orderId, due), []);
    expect(answer.status).toBe("accepted");
    expect(answer).not.toHaveProperty("shiftVersion");
  });
});
