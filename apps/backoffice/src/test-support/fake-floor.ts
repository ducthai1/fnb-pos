import type { AreaBodyInput, DiningTableBodyInput } from "@fnb/contracts";
import { vi as mock } from "vitest";
import type { Area, DiningTable, FloorApi } from "../lib/api/floor-api";
import { BRANCHES, ok } from "./fake-backoffice-api";
import { fixtureId } from "./fake-reports-and-day";

export const TERRACE: Area = {
  id: fixtureId(90),
  branchId: BRANCHES[0]!.id,
  name: "Sân vườn",
  sortOrder: 10,
  version: 3,
  archivedAt: null,
};

export const TABLE_1: DiningTable = {
  id: fixtureId(91),
  areaId: TERRACE.id,
  name: "Bàn 1",
  x: 2_400,
  y: 1_200,
  width: 800,
  height: 600,
  shape: "circle",
  seats: 4,
  sortOrder: 10,
  version: 5,
  archivedAt: null,
};

/**
 * The floor routes over a branch's plan held in memory: writes bump the version the way
 * the server does, and removing a table that orders sat at archives it instead.
 */
export function fakeFloor(areas: Area[] = [TERRACE], tables: DiningTable[] = [TABLE_1]) {
  const plan = { areas: [...areas], tables: [...tables] };
  const listAreas = mock.fn(async () => ok([...plan.areas]));
  const listTables = mock.fn(async () => ok([...plan.tables]));
  const putArea = mock.fn(async (id: string, body: AreaBodyInput) => {
    const stored = plan.areas.find((area) => area.id === id);
    const area: Area = { id, branchId: body.branchId, name: body.name, sortOrder: body.sortOrder, version: (stored?.version ?? 0) + 1, archivedAt: null };
    plan.areas = [...plan.areas.filter((each) => each.id !== id), area];
    return ok(area);
  });
  const putTable = mock.fn(async (id: string, body: DiningTableBodyInput) => {
    const stored = plan.tables.find((table) => table.id === id);
    const table: DiningTable = { ...body, id, version: (stored?.version ?? 0) + 1, archivedAt: null };
    plan.tables = [...plan.tables.filter((each) => each.id !== id), table];
    return ok(table);
  });
  const removeTable = mock.fn(async (id: string) => {
    plan.tables = plan.tables.map((table) => (table.id === id ? { ...table, archivedAt: "2026-10-20T03:00:00.000Z" } : table));
    return ok("archived" as const);
  });
  const removeArea = mock.fn(async (id: string) => {
    plan.areas = plan.areas.filter((area) => area.id !== id);
    return ok("deleted" as const);
  });
  const api: FloorApi = { listAreas, listTables, putArea, putTable, removeArea, removeTable };
  return { api, plan, putArea, putTable, removeArea, removeTable, listTables };
}
