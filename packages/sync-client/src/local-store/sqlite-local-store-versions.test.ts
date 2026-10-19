import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { SYNC_CLIENT_ERROR_CODES } from "../sync-client-error";
import { answer, change, draft, order, page } from "../sync/sync-client-test-support";
import { faultyDriver, testId } from "./local-store-test-support";
import { openNodeSqliteDriver } from "./node-sqlite-driver";
import { createSqliteLocalStore } from "./sqlite-local-store";

const memoryStore = () => createSqliteLocalStore(openNodeSqliteDriver(":memory:"));

const codeOf = async (work: Promise<unknown>) =>
  work.then(
    () => "no-error",
    (error: { code?: string }) => error.code ?? "no-code",
  );

describe("the server copy a till keeps", () => {
  it("is the highest version seen, whatever order pulls and answers bring copies in", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ version: fc.nat(50), viaPull: fc.boolean() }), {
          minLength: 1,
          maxLength: 20,
        }),
        async (arrivals) => {
          const store = memoryStore();
          const orderId = testId();
          let seq = 0;
          for (const [i, arrival] of arrivals.entries()) {
            const copy = order(orderId, arrival.version, { arrival: i });
            if (arrival.viaPull) {
              seq += 1;
              await store.applyChanges(page([change(seq, { ...copy, id: orderId })]));
            } else {
              const { command } = await store.enqueue(draft(orderId));
              await store.recordResults(
                [command],
                [answer(command, "accepted", { snapshot: copy })],
              );
            }
          }
          const highest = Math.max(...arrivals.map((arrival) => arrival.version));
          const first = arrivals.findIndex((arrival) => arrival.version === highest);
          expect(await store.snapshot("order", orderId)).toMatchObject({
            source: "server",
            serverVersion: highest,
            snapshot: { arrival: first },
          });
          await store.close();
        },
      ),
      { numRuns: 300 },
    );
  });

  it("stays deleted when an older copy arrives after the server deleted the row", async () => {
    const store = memoryStore();
    const orderId = testId();
    await store.applyChanges(page([change(1, order(orderId, 4))]));
    await store.applyChanges(
      page([{ changeSeq: "2", entity: "order", entityId: orderId, snapshot: null }]),
    );
    expect(await store.snapshot("order", orderId)).toBeNull();
    const { command } = await store.enqueue(draft(orderId));
    await store.recordResults(
      [command],
      [answer(command, "accepted", { snapshot: order(orderId, 3) })],
    );
    expect(await store.snapshot("order", orderId)).toBeNull();
    await store.applyChanges(page([change(3, order(orderId, 5))]));
    expect((await store.snapshot("order", orderId))?.serverVersion).toBe(5);
  });

  it("refuses a page with a copy it cannot order or of another row, keeping none of the page", async () => {
    const store = memoryStore();
    const orderId = testId();
    const unversioned = page([change(1, order(testId(), 1)), change(2, { id: orderId } as never)]);
    expect(await codeOf(store.applyChanges(unversioned))).toBe(
      SYNC_CLIENT_ERROR_CODES.snapshotWithoutVersion,
    );
    const misfiled = {
      changeSeq: "1",
      entity: "order",
      entityId: orderId,
      snapshot: order(testId(), 1),
    };
    expect(await codeOf(store.applyChanges(page([misfiled])))).toBe(
      SYNC_CLIENT_ERROR_CODES.snapshotOfAnotherEntity,
    );
    expect(await store.snapshots("order")).toEqual([]);
    expect(await store.cursor()).toBe("0");
  });
});

describe("a pulled page", () => {
  it("is kept together with its cursor: a failure writing the cursor keeps none of its rows", async () => {
    const { driver, control } = faultyDriver(openNodeSqliteDriver(":memory:"), (sql) =>
      sql.startsWith("INSERT INTO sync_meta"),
    );
    const store = createSqliteLocalStore(driver);
    const orderId = testId();
    control.armed = true;
    await expect(store.applyChanges(page([change(1, order(orderId, 1))]))).rejects.toThrow();
    control.armed = false;
    expect(await store.snapshot("order", orderId)).toBeNull();
    expect(await store.cursor()).toBe("0");
    await store.applyChanges(page([change(1, order(orderId, 1))]));
    expect(await store.cursor()).toBe("1");
  });
});

describe("an answer repeated for a command already settled", () => {
  it("settles nothing again and files no second rejection", async () => {
    const store = memoryStore();
    const orderId = testId();
    const { command } = await store.enqueue(draft(orderId));
    const refused = answer(command, "rejected", { code: "DOMAIN_X", snapshot: order(orderId, 1) });
    expect((await store.recordResults([command], [refused])).rejected).toEqual([command.commandId]);
    expect((await store.recordResults([command], [refused])).rejected).toEqual([]);
    expect(await store.rejectedCommands()).toHaveLength(1);
    expect(await store.pendingCount()).toBe(0);
  });
});
