import type { AreaBodyInput, DiningTableBodyInput } from "@fnb/contracts";
import { type ApiResult, type FetchLike, requestJson, resultOf } from "./api-result";
import { type JsonRecord, isRecord, listOf, nullableTextOf, textOf, wholeNumberOf } from "./read-json-fields";

/** A room or zone of a branch; archived once tables that orders sat at were in it. */
export interface Area {
  readonly id: string;
  readonly branchId: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly version: number;
  readonly archivedAt: string | null;
}

/** A table of an area, where it stands on the plan and how many it seats. */
export interface DiningTable {
  readonly id: string;
  readonly areaId: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly shape: "rectangle" | "circle";
  readonly seats: number;
  readonly sortOrder: number;
  readonly version: number;
  readonly archivedAt: string | null;
}

/** Removed for good when nothing ever pointed at it, else kept as history. */
export type RemoveOutcome = "deleted" | "archived";

const numbers = <K extends string>(item: JsonRecord, keys: readonly K[]) => {
  const read = keys.map((key) => [key, wholeNumberOf(item, key)] as const);
  return read.every(([, value]) => value !== null) ? (Object.fromEntries(read) as Record<K, number>) : null;
};

export function readArea(item: JsonRecord): Area | null {
  const id = textOf(item, "id");
  const branchId = textOf(item, "branchId");
  const name = textOf(item, "name");
  const archivedAt = nullableTextOf(item, "archivedAt");
  const counts = numbers(item, ["sortOrder", "version"]);
  if (id === null || branchId === null || name === null || archivedAt === undefined || counts === null) return null;
  return { id, branchId, name, archivedAt, ...counts };
}

export function readDiningTable(item: JsonRecord): DiningTable | null {
  const id = textOf(item, "id");
  const areaId = textOf(item, "areaId");
  const name = textOf(item, "name");
  const shape = textOf(item, "shape");
  const archivedAt = nullableTextOf(item, "archivedAt");
  const counts = numbers(item, ["x", "y", "width", "height", "seats", "sortOrder", "version"]);
  if (id === null || areaId === null || name === null || archivedAt === undefined || counts === null) return null;
  if (shape !== "rectangle" && shape !== "circle") return null;
  return { id, areaId, name, shape, archivedAt, ...counts };
}

const readOutcome = (body: unknown): RemoveOutcome | null => {
  const outcome = isRecord(body) ? body.outcome : null;
  return outcome === "deleted" || outcome === "archived" ? outcome : null;
};

const asRecord = <T>(read: (item: JsonRecord) => T | null) => (body: unknown) =>
  isRecord(body) ? read(body) : null;

export interface FloorApi {
  /** `GET /floor/areas?branchId=`: every area of the branch, archived ones included. */
  listAreas(branchId: string): Promise<ApiResult<Area[]>>;
  /** `GET /floor/tables?branchId=`: every table of the branch's areas, archived ones included. */
  listTables(branchId: string): Promise<ApiResult<DiningTable[]>>;
  /** `PUT /floor/areas/:id`: creates (version null) or replaces the version it was based on. */
  putArea(id: string, body: AreaBodyInput): Promise<ApiResult<Area>>;
  putTable(id: string, body: DiningTableBodyInput): Promise<ApiResult<DiningTable>>;
  /**
   * `DELETE /floor/areas/:id?version=` of the area last read: deleted when no table ever stood in
   * it, else archived; 409 when it changed since.
   */
  removeArea(id: string, version: number): Promise<ApiResult<RemoveOutcome>>;
  removeTable(id: string, version: number): Promise<ApiResult<RemoveOutcome>>;
}

export function httpFloorApi(base: string, fetchImpl: FetchLike): FloorApi {
  const list = async <T>(path: string, branchId: string, read: (item: JsonRecord) => T | null) => {
    const query = new URLSearchParams({ branchId });
    const answer = await requestJson(fetchImpl, `${base}/floor/${path}?${query}`, { method: "GET" });
    return resultOf(answer, (body) => listOf(body, read));
  };
  const at = (path: string, id: string) => `${base}/floor/${path}/${encodeURIComponent(id)}`;
  return {
    listAreas: (branchId) => list("areas", branchId, readArea),
    listTables: (branchId) => list("tables", branchId, readDiningTable),
    async putArea(id, body) {
      return resultOf(await requestJson(fetchImpl, at("areas", id), { method: "PUT", body }), asRecord(readArea));
    },
    async putTable(id, body) {
      const answer = await requestJson(fetchImpl, at("tables", id), { method: "PUT", body });
      return resultOf(answer, asRecord(readDiningTable));
    },
    async removeArea(id, version) {
      const url = `${at("areas", id)}?version=${version}`;
      return resultOf(await requestJson(fetchImpl, url, { method: "DELETE" }), readOutcome);
    },
    async removeTable(id, version) {
      const url = `${at("tables", id)}?version=${version}`;
      return resultOf(await requestJson(fetchImpl, url, { method: "DELETE" }), readOutcome);
    },
  };
}
