import fc from "fast-check";
import { SYNC_CLIENT_ERROR_CODES } from "../../sync-client-error";
import { answer, change, codeOf, draft, order, page, testId } from "../local-store-fixtures";
import { assertEqual, assertMatches, assertRejects } from "./contract-assert";
import type { LocalStoreContractGroup } from "./local-store-contract-harness";

export const SERVER_COPY_CONTRACT: LocalStoreContractGroup = {
  name: "the server copy a till keeps",
  cases: [
    {
      name: "is the highest version seen, whatever order pulls and answers bring copies in",
      async run(harness) {
        await fc.assert(
          fc.asyncProperty(
            fc.array(fc.record({ version: fc.nat(50), viaPull: fc.boolean() }), {
              minLength: 1,
              maxLength: 20,
            }),
            async (arrivals) => {
              const { store } = await harness.open();
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
              assertMatches(
                await store.snapshot("order", orderId),
                { source: "server", serverVersion: highest, snapshot: { arrival: first } },
                "view",
              );
              await store.close();
            },
          ),
          { numRuns: 300 },
        );
      },
    },
    {
      name: "tells of a removal of a row it never held a copy of",
      async run(harness) {
        const { store } = await harness.open();
        const orderId = testId();
        const write = await store.applyChanges(
          page([{ changeSeq: "1", entity: "order", entityId: orderId, snapshot: null }]),
        );
        assertEqual(write.changed, [{ entity: "order", entityId: orderId }], "changed");
        assertEqual(await store.snapshot("order", orderId), null, "nothing shown");
      },
    },
    {
      name: "stays deleted when an older copy arrives after the server deleted the row",
      async run(harness) {
        const { store } = await harness.open();
        const orderId = testId();
        await store.applyChanges(page([change(1, order(orderId, 4))]));
        await store.applyChanges(
          page([{ changeSeq: "2", entity: "order", entityId: orderId, snapshot: null }]),
        );
        assertEqual(await store.snapshot("order", orderId), null, "deleted row");
        const { command } = await store.enqueue(draft(orderId));
        await store.recordResults(
          [command],
          [answer(command, "accepted", { snapshot: order(orderId, 3) })],
        );
        assertEqual(await store.snapshot("order", orderId), null, "after an older copy");
        await store.applyChanges(page([change(3, order(orderId, 5))]));
        assertEqual((await store.snapshot("order", orderId))?.serverVersion, 5, "newer copy");
      },
    },
    {
      name: "refuses a page with a copy it cannot order or of another row, keeping none of the page",
      async run(harness) {
        const { store } = await harness.open();
        const orderId = testId();
        const unversioned = page([
          change(1, order(testId(), 1)),
          change(2, { id: orderId } as never),
        ]);
        assertEqual(
          await codeOf(store.applyChanges(unversioned)),
          SYNC_CLIENT_ERROR_CODES.snapshotWithoutVersion,
          "unversioned copy",
        );
        const misfiled = {
          changeSeq: "1",
          entity: "order",
          entityId: orderId,
          snapshot: order(testId(), 1),
        };
        assertEqual(
          await codeOf(store.applyChanges(page([misfiled]))),
          SYNC_CLIENT_ERROR_CODES.snapshotOfAnotherEntity,
          "copy of another row",
        );
        assertEqual(await store.snapshots("order"), [], "rows kept");
        assertEqual(await store.cursor(), "0", "cursor");
      },
    },
  ],
};

export const PULLED_PAGE_CONTRACT: LocalStoreContractGroup = {
  name: "a pulled page",
  cases: [
    {
      name: "is kept together with its cursor: a failure writing the cursor keeps none of its rows",
      async run(harness) {
        const db = await harness.open({ fault: { startsWith: "INSERT INTO sync_meta" } });
        const { store } = db;
        const orderId = testId();
        await db.setFaultArmed(true);
        await assertRejects(store.applyChanges(page([change(1, order(orderId, 1))])), /./);
        await db.setFaultArmed(false);
        assertEqual(await store.snapshot("order", orderId), null, "row of the failed page");
        assertEqual(await store.cursor(), "0", "cursor after the failure");
        await store.applyChanges(page([change(1, order(orderId, 1))]));
        assertEqual(await store.cursor(), "1", "cursor");
      },
    },
  ],
};

export const REPEATED_ANSWER_CONTRACT: LocalStoreContractGroup = {
  name: "an answer repeated for a command already settled",
  cases: [
    {
      name: "settles nothing again and files no second rejection",
      async run(harness) {
        const { store } = await harness.open();
        const orderId = testId();
        const { command } = await store.enqueue(draft(orderId));
        const refused = answer(command, "rejected", {
          code: "DOMAIN_X",
          snapshot: order(orderId, 1),
        });
        assertEqual(
          (await store.recordResults([command], [refused])).rejected,
          [command.commandId],
          "first answer",
        );
        assertEqual((await store.recordResults([command], [refused])).rejected, [], "repeat");
        assertEqual((await store.rejectedCommands()).length, 1, "rejections filed");
        assertEqual(await store.pendingCount(), 0, "pending count");
      },
    },
  ],
};
