import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { SYNC_ERROR_CODES } from "../shared/sync-error-codes";
import {
  addLineCommand,
  createCommand,
  payCommand,
  push,
  startTestPostgres,
} from "./server-test-harness";
import { type RunningSyncServer, startSyncServer } from "./sync-server-app";

let harness: Awaited<ReturnType<typeof startTestPostgres>>;
let server: RunningSyncServer;

beforeAll(async () => {
  harness = await startTestPostgres();
});
afterAll(async () => harness.stop());
afterEach(async () => server.close());

async function freshServer(): Promise<RunningSyncServer> {
  server = await startSyncServer({ connectionString: await harness.freshDatabase() });
  return server;
}

async function count(sql: string): Promise<number> {
  const { rows } = await server.pool.query<{ n: string }>(sql);
  return Number(rows[0]?.n);
}

describe("POST /commands idempotency", () => {
  it("applies a command once when the same batch is delivered twice", async () => {
    const { url } = await freshServer();
    const batch = [createCommand(1)];
    const first = await push(url, "till-a", batch);
    const second = await push(url, "till-a", batch);
    expect(first.results[0]).toMatchObject({ status: "accepted", replayed: false });
    expect(second.results[0]).toMatchObject({ status: "accepted", replayed: true });
    expect(await count("SELECT count(*) AS n FROM change_log")).toBe(2);
    expect(await count("SELECT sum(order_count) AS n FROM business_day_total")).toBe(1);
  });

  it("answers a retried rejected command with its original rejection and applies nothing", async () => {
    const { url } = await freshServer();
    const wrongTotal = [createCommand(1, undefined, "1")];
    const first = await push(url, "till-a", wrongTotal);
    const retry = await push(url, "till-a", wrongTotal);
    expect(first.results[0]).toMatchObject({ status: "rejected", replayed: false });
    expect(retry.results[0]).toMatchObject({
      status: "rejected",
      replayed: true,
      code: SYNC_ERROR_CODES.orderTotalMismatch,
      snapshot: null,
    });
    expect(await count("SELECT count(*) AS n FROM orders")).toBe(0);
  });
});

describe("POST /commands ordering per till", () => {
  it("defers a command that arrives before an earlier one from the same till", async () => {
    const { url } = await freshServer();
    const create = createCommand(1);
    const addLine = addLineCommand(2, create.payload.order_id);
    const early = await push(url, "till-a", [addLine]);
    expect(early.results[0]).toMatchObject({
      status: "retry",
      code: SYNC_ERROR_CODES.outOfOrder,
      expected_seq: 1,
    });
    expect(await count("SELECT count(*) AS n FROM applied_command")).toBe(0);

    const inOrder = await push(url, "till-a", [create, addLine]);
    expect(inOrder.results.map((r) => r.status)).toEqual(["accepted", "accepted"]);
  });

  it("rejects a different command that reuses an already applied device_seq", async () => {
    const { url } = await freshServer();
    await push(url, "till-a", [createCommand(1)]);
    const reused = await push(url, "till-a", [createCommand(1)]);
    expect(reused.results[0]).toMatchObject({
      status: "rejected",
      code: SYNC_ERROR_CODES.deviceSeqReused,
    });
    expect(await count("SELECT count(*) AS n FROM orders")).toBe(1);
  });
});

describe("POST /commands business rules", () => {
  it("rejects paying an order that another till already paid and returns the server copy", async () => {
    const { url } = await freshServer();
    const create = createCommand(1);
    const orderId = create.payload.order_id;
    await push(url, "till-a", [create, payCommand(2, orderId, "58000")]);
    const late = await push(url, "till-b", [payCommand(1, orderId, "58000")]);
    expect(late.results[0]).toMatchObject({
      status: "rejected",
      code: SYNC_ERROR_CODES.orderAlreadyPaid,
      snapshot: { order: { status: "paid", total_vnd: "58000" } },
    });
    expect(await count("SELECT sum(paid_count) AS n FROM business_day_total")).toBe(1);
  });

  it("rejects a payment whose amount no longer matches the order total", async () => {
    const { url } = await freshServer();
    const create = createCommand(1);
    const orderId = create.payload.order_id;
    await push(url, "till-a", [create]);
    await push(url, "till-b", [addLineCommand(1, orderId)]);
    const pay = await push(url, "till-a", [payCommand(2, orderId, "58000")]);
    expect(pay.results[0]).toMatchObject({
      status: "rejected",
      code: SYNC_ERROR_CODES.orderTotalMismatch,
      snapshot: { order: { status: "open", total_vnd: "116000" } },
    });
  });

  it("rejects adding a line to a paid order", async () => {
    const { url } = await freshServer();
    const create = createCommand(1);
    const orderId = create.payload.order_id;
    await push(url, "till-a", [create, payCommand(2, orderId, "58000")]);
    const add = await push(url, "till-b", [addLineCommand(1, orderId)]);
    expect(add.results[0]).toMatchObject({ code: SYNC_ERROR_CODES.orderAlreadyPaid });
    expect(await count("SELECT count(*) AS n FROM order_lines")).toBe(1);
  });
});
