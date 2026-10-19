import { join } from "node:path";
import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { faultyDriver, orderCommand, scratchDirectory, testId } from "./local-store-test-support";
import { openNodeSqliteDriver } from "./node-sqlite-driver";
import { createSqliteLocalStore } from "./sqlite-local-store";

const dir = scratchDirectory("outbox-reopen");
afterAll(() => dir.remove());

describe("an outbox on disk", () => {
  it("still holds its pending commands after the till restarts, and numbers on from them", async () => {
    const path = join(dir.path, "till.db");
    const first = createSqliteLocalStore(openNodeSqliteDriver(path));
    const orderId = testId();
    await first.bindDevice("0199f000-0000-7000-8000-00000000d001");
    await first.enqueue(orderCommand(orderId));
    await first.enqueue(orderCommand(orderId));
    await first.close();

    const reopened = createSqliteLocalStore(openNodeSqliteDriver(path));
    expect((await reopened.pendingCommands(10)).map((c) => c.deviceSeq)).toEqual([1, 2]);
    expect((await reopened.snapshot("order", orderId))?.source).toBe("optimistic");
    expect((await reopened.enqueue(orderCommand(orderId))).command.deviceSeq).toBe(3);
    await expect(reopened.bindDevice("0199f000-0000-7000-8000-00000000d002")).rejects.toThrow();
    await reopened.close();
  });
});

type Attempt = "valid" | "malformed" | "duplicate" | "fails";

describe("device_seq", () => {
  it("is 1, 2, 3… without a gap whatever mix of refused and failed writes came between", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom<Attempt>("valid", "malformed", "duplicate", "fails"), {
          maxLength: 30,
        }),
        async (attempts) => {
          const { driver, control } = faultyDriver(openNodeSqliteDriver(":memory:"), (sql) =>
            sql.startsWith("INSERT INTO entity_snapshot"),
          );
          const store = createSqliteLocalStore(driver);
          const taken = orderCommand(testId());
          await store.enqueue(taken);
          let committed = 1;
          for (const attempt of attempts) {
            const command =
              attempt === "malformed"
                ? orderCommand(testId(), { createdAt: "yesterday" })
                : attempt === "duplicate"
                  ? { ...orderCommand(testId()), commandId: taken.commandId }
                  : orderCommand(testId());
            control.armed = attempt === "fails";
            const ok = await store.enqueue(command).then(
              () => true,
              () => false,
            );
            control.armed = false;
            expect(ok).toBe(attempt === "valid");
            if (ok) committed += 1;
          }
          const seqs = (await store.pendingCommands(1_000)).map((c) => c.deviceSeq);
          expect(seqs).toEqual(Array.from({ length: committed }, (_, i) => i + 1));
          await store.close();
        },
      ),
      { numRuns: 200 },
    );
  });
});
