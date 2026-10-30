import type { PosBootstrap } from "@fnb/contracts";
import type { SyncClient } from "@fnb/sync-client";
import { createContext, useContext } from "react";

/** Where this till stands among the branch's tills, as the server said at start-up. */
export type CallNumbering = NonNullable<PosBootstrap["callNumbering"]>;

/**
 * The next running number of this till's orders: one past the highest it can see, mine or
 * the server's copy of mine. The database is bound to one till, so its orders hold every
 * number this till ever used; `usedThisSession` covers a number taken a moment ago whose
 * order the server has not answered for yet.
 */
export async function nextDeviceOrderNo(
  client: Pick<SyncClient, "snapshots">,
  deviceId: string,
  usedThisSession: number,
): Promise<number> {
  let highest = usedThisSession;
  for (const view of await client.snapshots("order")) {
    const { deviceId: owner, deviceOrderNo } = view.snapshot;
    if (owner === deviceId && typeof deviceOrderNo === "number" && deviceOrderNo > highest) {
      highest = deviceOrderNo;
    }
  }
  return highest + 1;
}

/** Hands out the till's order numbers, one at a time, to the counter and the tables alike. */
export interface OrderNumbers {
  next(): Promise<number>;
}

/**
 * The till's numbers for every order it opens this session, so a table opened while the
 * counter holds an empty order (numbered, not saved yet) never takes that order's number.
 */
export function orderNumbers(
  client: Pick<SyncClient, "snapshots">,
  deviceId: string,
): OrderNumbers {
  let used = 0;
  let last: Promise<number> = Promise.resolve(0);
  return {
    next() {
      const taken = last.then(async () => {
        used = await nextDeviceOrderNo(client, deviceId, used);
        return used;
      });
      last = taken.catch(() => used);
      return taken;
    },
  };
}

/**
 * The number called out when the drink is ready, from the till's own count: the server has
 * no call number for a counter order until it is posted. A branch with one till calls 1 to
 * 99 (two digits are easy to shout and to spot on a cup). From two tills on, a call is the
 * till's index (1 to 9) as the hundreds digit and the last two digits of the order's number,
 * so two tills never call the same number; a till without an index (more than nine tills)
 * keeps the plain numbers.
 */
export function callNumberOf(
  deviceOrderNo: number,
  numbering: CallNumbering | null = null,
): string {
  if (numbering !== null && numbering.deviceIndex !== null && numbering.tillsInBranch >= 2) {
    return String(numbering.deviceIndex * 100 + (deviceOrderNo % 100));
  }
  return String(((deviceOrderNo - 1) % 100) + 1);
}

/** The till's call numbering for the screens that show a call number; null when unknown. */
export const CallNumberingContext = createContext<CallNumbering | null>(null);

/** `callNumberOf` with this till's numbering, for a screen to call out an order. */
export function useCallNumber(): (deviceOrderNo: number) => string {
  const numbering = useContext(CallNumberingContext);
  return (deviceOrderNo) => callNumberOf(deviceOrderNo, numbering);
}
