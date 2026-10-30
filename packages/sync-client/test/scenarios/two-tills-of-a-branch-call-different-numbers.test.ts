import type { SyncShop } from "@fnb/api/test-support/sync-shop";
import { posBootstrapSchema } from "@fnb/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ScenarioServer } from "../support/scenario-server";

let server: ScenarioServer;
let shop: SyncShop;

beforeAll(async () => ({ server, shop } = await ScenarioServer.withShop()));
afterAll(() => server.close());

async function numberingOf(deviceToken: string) {
  const answer = await server.send({
    method: "GET",
    path: "/pos/bootstrap?call-numbering=1",
    headers: { authorization: `Device ${deviceToken}` },
  });
  expect(answer.status).toBe(200);
  return posBootstrapSchema.parse(JSON.parse(answer.body)).callNumbering;
}

describe("two tills of one branch asking how to number their calls", () => {
  it("get different indexes and both see that the branch has two tills", async () => {
    const a = await numberingOf(shop.tillA.deviceToken);
    const b = await numberingOf(shop.tillB.deviceToken);
    expect(a?.deviceIndex).not.toBeNull();
    expect(b?.deviceIndex).not.toBeNull();
    expect(a?.deviceIndex).not.toBe(b?.deviceIndex);
    expect(a?.tillsInBranch).toBeGreaterThanOrEqual(2);
    expect(b?.tillsInBranch).toBe(a?.tillsInBranch);
    // Asking again changes nothing: the index is the till's for good.
    expect(await numberingOf(shop.tillA.deviceToken)).toEqual(a);
  });

  it("is not told to a till of another branch, whose own tills are counted apart", async () => {
    const other = await numberingOf(shop.otherBranchTill.deviceToken);
    expect(other).toEqual({ deviceIndex: 1, tillsInBranch: 1 });
  });
});
