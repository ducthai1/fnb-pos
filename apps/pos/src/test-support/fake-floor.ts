import type { ApiFailure } from "../features/api/api-result";
import type { FloorOccupancy, FloorSource } from "../features/floor/floor-occupancy";
import type { Row } from "./fake-table-rows";

/** The branch's floor plan as the backoffice set it up: areas, and tables in them. */
export interface FakeFloorPlan {
  areas: { id: string; name: string }[];
  tables: { id: string; areaId: string; name: string; seats: number }[];
}

/**
 * GET /floor/occupancy as the server answers it: the plan, and each table's status read
 * from the draft order seated there among the server's rows.
 */
export function fakeFloorSource(
  state: { online: boolean; floorPlan: FakeFloorPlan; floorFailure: ApiFailure | null },
  rows: ReadonlyMap<string, Row>,
  calls: { floor: number },
): FloorSource {
  return {
    async load() {
      calls.floor += 1;
      if (!state.online) return { ok: false, status: null, code: null, body: null };
      if (state.floorFailure !== null) return state.floorFailure;
      const seated = [...rows.values()].filter((row) => row.status === "draft" && row.tableId);
      const occupancy: FloorOccupancy = {
        areas: state.floorPlan.areas,
        tables: state.floorPlan.tables.map((table) => {
          const order = seated.find((row) => row.tableId === table.id);
          return {
            ...table,
            layout: null,
            status:
              order === undefined
                ? "free"
                : order.preBillPrinted === true
                  ? "awaiting_payment"
                  : "occupied",
            orderId: order?.id ?? null,
            openedAt: (order?.openedAt as string | undefined) ?? null,
          };
        }),
      };
      return { ok: true, value: occupancy };
    },
  };
}
