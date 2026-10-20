import type { PosFloorPlan } from "@fnb/contracts";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { CREDENTIAL } from "../test-support/fake-pos-server";
import {
  FLOOR,
  anotherTillSeats,
  openTable,
  tableCafeServer,
  tile,
  tileStatus,
  tillOnTheFloor,
} from "../test-support/table-cafe-server";

const table = (id: string, name: string, sortOrder: number, version = 5) => ({
  id,
  areaId: FLOOR.downstairs,
  name,
  x: 100 * sortOrder,
  y: 0,
  width: 80,
  height: 80,
  shape: "rectangle" as const,
  seats: 4,
  sortOrder,
  version,
});

/** Downstairs with tables 1 and 2, as the bootstrap sends the plan. */
const PLAN: PosFloorPlan = {
  areas: [
    {
      id: FLOOR.downstairs,
      branchId: CREDENTIAL.branchId,
      name: "Tầng 1",
      sortOrder: 0,
      version: 5,
    },
  ],
  tables: [table(FLOOR.t1, "1", 0), table(FLOOR.t2, "2", 1)],
};

describe("the floor a bootstrap brings", () => {
  it("draws the plan without reading the network, and follows the feed's tables", async () => {
    const server = tableCafeServer(true, {}, undefined, { floor: PLAN });
    // The plan's own endpoint is down: the floor never needs it.
    server.state.floorFailure = { ok: false, status: 500, code: "API_INTERNAL", body: null };
    await tillOnTheFloor(server);
    expect(tile(FLOOR.t2)?.textContent).toContain("2");
    expect(tile(FLOOR.t3)).toBeNull();

    server.state.feed.push(
      { entity: "floor_table", entityId: FLOOR.t3, snapshot: table(FLOOR.t3, "3", 2, 30) },
      { entity: "floor_table", entityId: FLOOR.t2, snapshot: null },
    );
    await waitFor(() => expect(tile(FLOOR.t3)).not.toBeNull());
    await waitFor(() => expect(tile(FLOOR.t2)).toBeNull());
    expect(server.state.calls.floor).toBe(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("seats the guests the bootstrap names, and opens their order before the feed brings it", async () => {
    const scratch = tableCafeServer();
    const seated = anotherTillSeats(scratch, FLOOR.t2, { coffees: 3, feed: false });
    const server = tableCafeServer(true, {}, undefined, {
      floor: PLAN,
      openOrders: [seated.row],
    });
    server.rows.set(seated.orderId, seated.row);
    await tillOnTheFloor(server);

    await waitFor(() => expect(tileStatus(FLOOR.t2)).toBe("occupied"));
    expect(tileStatus(FLOOR.t1)).toBe("free");
    // Seated 25½ minutes ago by the other till: the order's own opening time says so.
    const F = text.tables.floor;
    expect(tile(FLOOR.t2)?.textContent).toContain(F.seatedFor(F.minutes(25)));
    await openTable(FLOOR.t2, "2");
    expect(screen.queryByText(text.tables.floor.orderNotOnTill)).toBeNull();
    expect(screen.getAllByText(/Cà phê sữa/).length).toBeGreaterThan(0);
  });
});
