import type { SyncClient } from "@fnb/sync-client";

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

/**
 * The number called out when the drink is ready, from the till's own count: the server has
 * no call number for a counter order until it is posted. Two digits are easy to shout and
 * to spot on a cup, and a hundred orders apart never wait at the counter together.
 */
export function callNumberOf(deviceOrderNo: number): string {
  return String(((deviceOrderNo - 1) % 100) + 1);
}
