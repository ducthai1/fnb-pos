import { answer, draft, order, testId } from "../local-store-fixtures";
import { assertEqual } from "./contract-assert";
import type { LocalStoreContractGroup } from "./local-store-contract-harness";

const OLD = "0192f5a4-0000-7000-8000-0000000000e1";
const NEW = "0192f5a4-0000-7000-8000-0000000000e2";
const SETTLED_AT = "2026-10-20T03:00:00.000Z";

export const SERVER_RESTORE_CONTRACT: LocalStoreContractGroup = {
  name: "a till meeting a server restored from backup",
  cases: [
    {
      name: "keeps the journal across a restart and sends again, in order, what the server lost",
      async run(harness) {
        const name = `till-${testId()}`;
        const first = (await harness.openFile(name)).store;
        await first.adoptServerGeneration(OLD);
        for (let n = 0; n < 3; n += 1) {
          const orderId = testId();
          const { command } = await first.enqueue(draft(orderId));
          const snapshot = order(orderId, 2);
          await first.recordResults(
            [command],
            [answer(command, "accepted", { snapshot })],
            SETTLED_AT,
          );
        }
        await first.close();

        const reopened = (await harness.openFile(name)).store;
        assertEqual(await reopened.serverGeneration(), OLD, "generation after reopening");
        const rebase = await reopened.rebaseOntoGeneration(NEW, 1);
        assertEqual([rebase.resent, rebase.unrecoverable], [2, 0], "rebase");
        const pending = await reopened.pendingCommands(10);
        assertEqual(
          pending.map((c) => [c.deviceSeq, c.resentFromGeneration]),
          [
            [2, OLD],
            [3, OLD],
          ],
          "resent commands",
        );
        assertEqual(await reopened.cursor(), "0", "cursor");
        assertEqual(await reopened.restoreState(), { resending: 2, unrecoverable: 0 }, "state");
        await reopened.close();
      },
    },
    {
      name: "drops settled commands past their age, never one still waiting",
      async run(harness) {
        const { store, querySql } = await harness.open();
        const settled = (await store.enqueue(draft(testId()))).command;
        await store.enqueue(draft(testId()));
        await store.recordResults([settled], [answer(settled, "accepted")], SETTLED_AT);
        assertEqual(
          await store.pruneJournal("2026-10-30T00:00:00.000Z", "2026-10-29T00:00:00.000Z"),
          1,
          "dropped",
        );
        const rows = await querySql("SELECT device_seq, status FROM outbox ORDER BY device_seq");
        assertEqual(rows, [{ device_seq: 2, status: "pending" }], "outbox");
        await store.close();
      },
    },
  ],
};
