import fc from "fast-check";
import { orderCommand, testId } from "../local-store-fixtures";
import { assertEqual } from "./contract-assert";
import type { LocalStoreContractGroup } from "./local-store-contract-harness";

type Attempt = "valid" | "malformed" | "duplicate" | "fails";

export const REOPEN_CONTRACT: LocalStoreContractGroup = {
  name: "an outbox on disk",
  cases: [
    {
      name: "still holds its pending commands after the till restarts, and numbers on from them",
      async run(harness) {
        const name = `till-${testId()}`;
        const first = (await harness.openFile(name)).store;
        const orderId = testId();
        await first.bindDevice("0199f000-0000-7000-8000-00000000d001");
        await first.enqueue(orderCommand(orderId));
        await first.enqueue(orderCommand(orderId));
        await first.close();

        const reopened = (await harness.openFile(name)).store;
        assertEqual(
          (await reopened.pendingCommands(10)).map((c) => c.deviceSeq),
          [1, 2],
          "device_seq after reopening",
        );
        assertEqual((await reopened.snapshot("order", orderId))?.source, "optimistic", "row");
        assertEqual((await reopened.enqueue(orderCommand(orderId))).command.deviceSeq, 3, "next");
        const otherTill = await reopened.bindDevice("0199f000-0000-7000-8000-00000000d002").then(
          () => "bound",
          () => "refused",
        );
        assertEqual(otherTill, "refused", "another till");
        await reopened.close();
      },
    },
  ],
};

export const DEVICE_SEQ_CONTRACT: LocalStoreContractGroup = {
  name: "device_seq",
  cases: [
    {
      name: "is 1, 2, 3… without a gap whatever mix of refused and failed writes came between",
      async run(harness) {
        await fc.assert(
          fc.asyncProperty(
            fc.array(fc.constantFrom<Attempt>("valid", "malformed", "duplicate", "fails"), {
              maxLength: 30,
            }),
            async (attempts) => {
              const db = await harness.open({
                fault: { startsWith: "INSERT INTO entity_snapshot" },
              });
              const { store } = db;
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
                await db.setFaultArmed(attempt === "fails");
                const ok = await store.enqueue(command).then(
                  () => true,
                  () => false,
                );
                await db.setFaultArmed(false);
                assertEqual(ok, attempt === "valid", `${attempt} write went through`);
                if (ok) committed += 1;
              }
              const seqs = (await store.pendingCommands(1_000)).map((c) => c.deviceSeq);
              assertEqual(
                seqs,
                Array.from({ length: committed }, (_, i) => i + 1),
                "device_seq",
              );
              await store.close();
            },
          ),
          { numRuns: 200 },
        );
      },
    },
  ],
};
