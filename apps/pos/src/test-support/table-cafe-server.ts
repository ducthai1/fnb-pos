import type { PosBootstrapWire, SyncCommandEnvelope } from "@fnb/contracts";
import { DOMAIN_VERSION } from "@fnb/domain";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import { type PrinterPort, previewOnlyPrinter } from "../features/printing/printer-port";
import { vi as text } from "../messages/vi";
import { CREDENTIAL, fakeDependencies, fakeServer, memoryCredentials } from "./fake-pos-server";
import { LAN, signedInTill } from "./signed-in-till";
import { MENU, tid, tillBootstrap, tillBootstrapWire } from "./till-fixtures";

/** The café's floor: three tables downstairs, one in the garden. */
export const FLOOR = {
  downstairs: tid(0x700),
  garden: tid(0x701),
  t1: tid(0x710),
  t2: tid(0x711),
  t3: tid(0x712),
  s1: tid(0x720),
} as const;

/** The branch's other till, which seats guests the till under test only hears of by sync. */
export const OTHER_TILL = tid(0xd200);

export type TableServer = ReturnType<typeof fakeServer>;

/**
 * The pilot café serving at tables (its `tables` switch as given), the branch's other
 * settings being `settings`, Lan's PIN being 4826.
 */
export function tableCafeServer(
  tablesOn = true,
  settings: Record<string, unknown> = {},
  staff: { id: string; displayName: string; active: boolean }[] = [LAN],
  /** More of the bootstrap: the floor plan, the drafts open at the tables. */
  start: Pick<PosBootstrapWire, "floor" | "openOrders" | "menu"> = {},
) {
  const { config } = tillBootstrapWire();
  const flags = { ...config.flags, tables: tablesOn };
  const bootstrap = tillBootstrap({ ...start, staff, config: { ...config, flags, settings } });
  const server = fakeServer(bootstrap);
  server.state.pins.set(LAN.id, "4826");
  server.state.floorPlan = {
    areas: [
      { id: FLOOR.downstairs, name: "Tầng 1" },
      { id: FLOOR.garden, name: "Sân vườn" },
    ],
    tables: [
      { id: FLOOR.t1, areaId: FLOOR.downstairs, name: "1", seats: 4 },
      { id: FLOOR.t2, areaId: FLOOR.downstairs, name: "2", seats: 2 },
      { id: FLOOR.t3, areaId: FLOOR.downstairs, name: "3", seats: 6 },
      { id: FLOOR.s1, areaId: FLOOR.garden, name: "S1", seats: 8 },
    ],
  };
  return server;
}

let seeded = 0;

/**
 * Another till seats guests at `tableId` with `coffees` milk coffees (sent to the bar when
 * `sent`), as the server stores it. With `feed`, the change feed carries it to this till.
 */
export function anotherTillSeats(
  server: TableServer,
  tableId: string,
  options: { coffees?: number; sent?: boolean; feed?: boolean } = {},
) {
  seeded += 1;
  const orderId = tid(0x9000 + seeded);
  const lineId = tid(0x9100 + seeded);
  const command: SyncCommandEnvelope = {
    commandId: tid(0x9200 + seeded),
    deviceSeq: seeded,
    type: "order.save_draft",
    payload: {
      orderId,
      deviceOrderNo: 900 + seeded,
      serviceType: "dine_in",
      channelKey: null,
      tableId,
      tableTag: null,
      lines: [
        {
          lineId,
          productId: MENU.coffee,
          variantId: null,
          modifiers: [],
          quantity: String(options.coffees ?? 2),
          note: null,
        },
      ],
    },
    businessDate: "2026-10-20",
    domainVersion: DOMAIN_VERSION,
    // 25½ minutes ago: the floor reads its clock every 30 s and still shows 25 minutes.
    createdAt: new Date(Date.now() - 25.5 * 60_000).toISOString(),
  };
  const answered = server.answer(command);
  if (answered === undefined) throw new Error("the fake server did not seat the order");
  const lines = (answered.lines as Record<string, unknown>[]).map((line) =>
    line.id === lineId && options.sent === true ? { ...line, sentQuantity: line.quantity } : line,
  );
  const row = { ...answered, deviceId: OTHER_TILL, lines };
  server.rows.set(orderId, row);
  if (options.feed ?? true)
    server.state.feed.push({ entity: "order", entityId: orderId, snapshot: row });
  return { orderId, lineId, deviceOrderNo: 900 + seeded, row };
}

/** The other till takes the money for the order; the change feed carries it. */
export function anotherTillPays(server: TableServer, orderId: string) {
  const before = server.rows.get(orderId);
  if (before === undefined) throw new Error(`no order ${orderId}`);
  const row = { ...before, status: "paid", version: before.version + 1 };
  server.rows.set(orderId, row);
  server.state.feed.push({ entity: "order", entityId: orderId, snapshot: row });
}

/** From the counter to the floor, once its plan is on screen. */
export async function openFloor() {
  fireEvent.click(await screen.findByRole("button", { name: text.tables.modes.tables }));
  await screen.findByRole("tab", { name: "Tầng 1" });
}

/** The tile of a table, found by its id. */
export const tile = (tableId: string) =>
  document.querySelector<HTMLButtonElement>(`[data-table="${tableId}"]`);
export const tileStatus = (tableId: string) => tile(tableId)?.getAttribute("data-table-status");

/** A till of the café with Lan signed in, on the floor, its slips going to `printer`. */
export async function tillOnTheFloor(
  server: TableServer,
  printer: PrinterPort = previewOnlyPrinter,
) {
  const credentials = memoryCredentials(CREDENTIAL).store;
  await signedInTill(server, { deps: fakeDependencies(server, { credentials, printer }) });
  await openFloor();
  await waitFor(() => expect(tile(FLOOR.t1)).not.toBeNull());
}

/** Taps a table on the floor and waits for its order. */
export async function openTable(tableId: string, name: string) {
  fireEvent.click(tile(tableId)!);
  await screen.findByRole("heading", { name: text.tables.order.title(name) });
}

export const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

/** Milk coffees with no extra shot, 29.000 each, added as one line. */
export function addCoffees(count: number) {
  tap(/^Cà phê sữa/);
  for (let more = 1; more < count; more += 1) tap(text.sale.more("Cà phê sữa"));
  tap(/^Thêm vào đơn/);
}

/** An L milk tea with 50% sugar, 45.000. */
export function addMilkTea() {
  tap(/^Trà sữa trân châu/);
  tap("L");
  tap("50% đường");
  tap(/^Thêm vào đơn/);
}

export const pushedOf = (server: TableServer, type: string) =>
  server.state.pushed.filter((command) => command.type === type);
