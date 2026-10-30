import { type ClosingAssessment, ZERO_VND } from "@fnb/domain";
import type { SyncClient } from "@fnb/sync-client";
import { useEffect, useState } from "react";
import { type StoredShift, readStoredShift } from "./stored-shift";

type Client = Pick<
  SyncClient,
  "snapshot" | "pendingCommands" | "rejectedCommands" | "onChange" | "syncOnce"
>;

/** Where the server stands on the till's shift.close: not yet, took it, or refused it. */
export type ServerClose =
  | { readonly kind: "waiting" }
  | { readonly kind: "closed"; readonly shift: StoredShift }
  | { readonly kind: "refused" };

/**
 * What the till knows of the server's answer to its close command: still waiting while the
 * command is in the outbox; refused when it sits in the refused list; otherwise the server
 * took it and the shift's copy is the closed shift the server holds, with its own figures.
 */
export async function readServerClose(
  client: Pick<Client, "snapshot" | "pendingCommands" | "rejectedCommands">,
  shiftId: string,
  commandId: string,
): Promise<ServerClose> {
  const pending = await client.pendingCommands();
  if (pending.some((command) => command.commandId === commandId)) return { kind: "waiting" };
  const refused = await client.rejectedCommands();
  if (refused.some((entry) => entry.command.commandId === commandId)) return { kind: "refused" };
  const view = await client.snapshot("shift", shiftId);
  const shift = view === null ? null : readStoredShift(view.snapshot);
  return shift !== null && shift.status === "closed" && shift.close !== null
    ? { kind: "closed", shift }
    : { kind: "waiting" };
}

/**
 * Waits for the server's answer to the close for up to `timeoutMs`, pushing the outbox now so
 * a till with a network does not wait for the next round of the background sync. "timeout":
 * no answer in time (no network, or a slow server): the till prints from its own numbers.
 */
export function awaitServerClose(
  client: Client,
  shiftId: string,
  commandId: string,
  timeoutMs: number,
): Promise<ServerClose | { readonly kind: "timeout" }> {
  return new Promise((resolve) => {
    let finished = false;
    let unsubscribe = () => {};
    const timer = setTimeout(() => finish({ kind: "timeout" }), timeoutMs);
    function finish(outcome: ServerClose | { readonly kind: "timeout" }) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(outcome);
    }
    const check = () =>
      readServerClose(client, shiftId, commandId).then((now) => {
        if (now.kind !== "waiting") finish(now);
      }, console.error);
    unsubscribe = client.onChange(() => void check());
    void check();
    // Offline, the push fails: that is what the timeout is for.
    void client.syncOnce().then(check, () => {});
  });
}

/** The server's answer to a close the till printed provisionally, read as it comes. */
export function useServerClose(
  client: Pick<Client, "snapshot" | "pendingCommands" | "rejectedCommands" | "onChange"> | null,
  shiftId: string,
  commandId: string | null,
): ServerClose {
  const [answer, setAnswer] = useState<ServerClose>({ kind: "waiting" });
  useEffect(() => {
    if (client === null || commandId === null) return undefined;
    let live = true;
    const check = () =>
      readServerClose(client, shiftId, commandId).then((now) => {
        if (live) setAnswer(now);
      }, console.error);
    const unsubscribe = client.onChange(() => void check());
    void check();
    return () => {
      live = false;
      unsubscribe();
    };
  }, [client, shiftId, commandId]);
  return answer;
}

/** The count of a shift the server closed, as its own figures read: nothing is estimated. */
export function assessmentOfClosedShift(shift: StoredShift): ClosingAssessment {
  return {
    expectedCash: shift.figures.expectedCash,
    // A closed shift always has its close (readServerClose only hands out those).
    countedCash: shift.close?.countedCash ?? ZERO_VND,
    difference: shift.close?.difference ?? ZERO_VND,
    needsAcceptance: false,
  };
}
