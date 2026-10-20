import { newId } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import { areaWithTables } from "./floor-plan";
import { type LineIntent, command } from "./sync-commands";
import type { SyncShop, Till } from "./sync-shop";

/** Tables of the shop's branch by name, and one of its other branch. */
export interface ShopFloor {
  areaId: string;
  tables: Record<"B01" | "B02" | "B03" | "B04", string>;
  otherBranchTable: string;
}

/** A floor plan made through the backoffice API: four tables in one area, one elsewhere. */
export async function shopFloor(app: FastifyInstance, s: SyncShop): Promise<ShopFloor> {
  const cookie = s.shop.managerCookie;
  const names = ["B01", "B02", "B03", "B04"] as const;
  const here = await areaWithTables(app, cookie, s.shop.branchId, names);
  const there = await areaWithTables(app, cookie, s.shop.otherBranchId, ["B01"]);
  return {
    areaId: here.areaId,
    tables: Object.fromEntries(names.map((name, i) => [name, here.tableIds[i]])) as Record<
      (typeof names)[number],
      string
    >,
    otherBranchTable: there.tableIds[0]!,
  };
}

interface DineIn {
  orderId?: string;
  deviceOrderNo?: number;
  tableId?: string | null;
  tableTag?: string | null;
  serviceType?: string;
}

/** order.save_draft of a dine-in order: seated at a table, or a counter order with a tag. */
export function dineIn(till: Till, lines: LineIntent[], order: DineIn = {}) {
  return command(till, "order.save_draft", {
    orderId: order.orderId ?? newId(),
    deviceOrderNo: order.deviceOrderNo ?? till.nextOrderNo++,
    serviceType: order.serviceType ?? "dine_in",
    channelKey: null,
    ...(order.tableId === undefined ? {} : { tableId: order.tableId }),
    ...(order.tableTag === undefined ? {} : { tableTag: order.tableTag }),
    lines,
  });
}

/** The same draft saved again by `till` with `lines`, keeping its number and table. */
export function savedAgain(
  till: Till,
  sent: ReturnType<typeof dineIn>,
  lines: LineIntent[],
  change: Partial<DineIn> = {},
) {
  const payload = sent.payload as Required<DineIn>;
  return dineIn(till, lines, {
    orderId: payload.orderId,
    deviceOrderNo: payload.deviceOrderNo,
    tableId: payload.tableId,
    ...change,
  });
}

export const transferTable = (
  till: Till,
  orderId: string,
  toTableId: string,
  approvalId?: string,
) =>
  command(till, "table.transfer", {
    orderId,
    toTableId,
    ...(approvalId === undefined ? {} : { approvalId }),
  });

/** The pre-bill printed for `printedVersion` of the order, or (unnamed) for it as it is. */
export const markPreBillPrinted = (till: Till, orderId: string, printedVersion?: number) =>
  command(till, "order.mark_pre_bill_printed", {
    orderId,
    ...(printedVersion === undefined ? {} : { printedVersion }),
  });

export interface OccupiedTable {
  id: string;
  name: string;
  status: string;
  orderId: string | null;
  openedAt: string | null;
}

/** The till's floor screen, as table id → what the screen shows of it. */
export async function occupancy(app: FastifyInstance, till: Till) {
  const response = await app.inject({
    method: "GET",
    url: "/floor/occupancy",
    headers: { authorization: `Device ${till.deviceToken}` },
  });
  if (response.statusCode !== 200) throw new Error(`occupancy answered ${response.statusCode}`);
  const tables = response.json().tables as OccupiedTable[];
  return new Map(tables.map((table) => [table.id, table]));
}

/** Status and order of one table on the till's floor screen. */
export async function seatingOf(app: FastifyInstance, till: Till, tableId: string) {
  const table = (await occupancy(app, till)).get(tableId);
  return table === undefined ? undefined : { status: table.status, orderId: table.orderId };
}
