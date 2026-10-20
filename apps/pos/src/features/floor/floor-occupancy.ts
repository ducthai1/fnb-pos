import { type TableStatus, tableStatusSchema } from "@fnb/contracts";
import type { DeviceCredential } from "../../shell-bridge/device-credential-store";
import { type ApiResult, type FetchLike, requestJson, resultOf } from "../api/api-result";
import { deviceAuthorization } from "../api/pos-api";

export interface FloorArea {
  readonly id: string;
  readonly name: string;
}

/** Where a table stands on the plan, in the floor editor's units; the till scales it. */
export interface TableLayout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly shape: "rectangle" | "circle";
}

/** A table of the plan and who sits at it, as the server last said. */
export interface FloorTable {
  readonly id: string;
  readonly areaId: string;
  readonly name: string;
  readonly seats: number;
  readonly status: TableStatus;
  /** The draft order seated at the table, if any. */
  readonly orderId: string | null;
  /** When that order was opened (kept across a move to another table). */
  readonly openedAt: string | null;
  /** Null when the answer carries no usable place for it: the till then lists it in a grid. */
  readonly layout: TableLayout | null;
}

/** GET /floor/occupancy: the till's branch plan in display order, archived parts left out. */
export interface FloorOccupancy {
  readonly areas: readonly FloorArea[];
  readonly tables: readonly FloorTable[];
}

export interface FloorSource {
  load(credential: DeviceCredential): Promise<ApiResult<FloorOccupancy>>;
}

type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row => typeof value === "object" && value !== null;
const text = (row: Row, key: string) => (typeof row[key] === "string" ? row[key] : null);
const whole = (row: Row, key: string, least: number) =>
  typeof row[key] === "number" && Number.isInteger(row[key]) && row[key] >= least ? row[key] : null;
const shown = (row: Row) => row.archivedAt === null || row.archivedAt === undefined;

function areaOf(row: Row): FloorArea | null {
  const id = text(row, "id");
  const name = text(row, "name");
  return id === null || name === null || !shown(row) ? null : { id, name };
}

function layoutOf(row: Row): TableLayout | null {
  const x = whole(row, "x", 0);
  const y = whole(row, "y", 0);
  const width = whole(row, "width", 1);
  const height = whole(row, "height", 1);
  if (x === null || y === null || width === null || height === null) return null;
  return { x, y, width, height, shape: row.shape === "circle" ? "circle" : "rectangle" };
}

function tableOf(row: Row): FloorTable | null {
  const id = text(row, "id");
  const areaId = text(row, "areaId");
  const name = text(row, "name");
  const status = tableStatusSchema.safeParse(row.status);
  if (id === null || areaId === null || name === null || !status.success || !shown(row)) {
    return null;
  }
  const seats = typeof row.seats === "number" && Number.isInteger(row.seats) ? row.seats : 0;
  return {
    id,
    areaId,
    name,
    seats,
    status: status.data,
    orderId: text(row, "orderId"),
    openedAt: text(row, "openedAt"),
    layout: layoutOf(row),
  };
}

/**
 * The answer, or null when it is not one. The server already leaves archived areas and
 * tables out; a row still marked archived is dropped here too, so it can never be offered.
 */
export function parseFloorOccupancy(body: unknown): FloorOccupancy | null {
  if (!isRow(body) || !Array.isArray(body.areas) || !Array.isArray(body.tables)) return null;
  const areas = body.areas.filter(isRow).flatMap((row) => areaOf(row) ?? []);
  const areaIds = new Set(areas.map((area) => area.id));
  const tables = body.tables
    .filter(isRow)
    .flatMap((row) => tableOf(row) ?? [])
    .filter((table) => areaIds.has(table.areaId));
  return { areas, tables };
}

export function httpFloorSource(
  baseUrl: string,
  fetchImpl: FetchLike = (u, i) => fetch(u, i),
): FloorSource {
  const base = baseUrl.replace(/\/+$/, "");
  return {
    async load(credential) {
      const answer = await requestJson(fetchImpl, `${base}/floor/occupancy`, {
        method: "GET",
        headers: deviceAuthorization(credential),
      });
      return resultOf(answer, parseFloorOccupancy);
    },
  };
}
