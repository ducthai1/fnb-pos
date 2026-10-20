import {
  FLOOR_AREA_ENTITY,
  FLOOR_TABLE_ENTITY,
  type PosFloorArea,
  type PosFloorPlan,
  type PosFloorTable,
  posFloorAreaSchema,
  posFloorTableSchema,
} from "@fnb/contracts";
import type { SyncClient } from "@fnb/sync-client";
import type { FloorOccupancy } from "./floor-occupancy";

const FLOOR_ENTITIES: ReadonlySet<string> = new Set([FLOOR_AREA_ENTITY, FLOOR_TABLE_ENTITY]);
export const isFloorEntity = (entity: string) => FLOOR_ENTITIES.has(entity);
export const floorKey = (entity: string, entityId: string) => `${entity}:${entityId}`;

/** The floor rows the till's database holds from the change feed, and every row it shows. */
export interface FloorCopies {
  readonly areas: ReadonlyMap<string, PosFloorArea>;
  readonly tables: ReadonlyMap<string, PosFloorTable>;
  readonly shown: ReadonlySet<string>;
}

export const NO_FLOOR_COPIES: FloorCopies = {
  areas: new Map(),
  tables: new Map(),
  shown: new Set(),
};

interface CopyParser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

async function copiesOf<T>(
  client: Pick<SyncClient, "snapshots">,
  entity: string,
  parser: CopyParser<T>,
  shown: Set<string>,
): Promise<Map<string, T>> {
  const copies = new Map<string, T>();
  for (const view of await client.snapshots(entity)) {
    shown.add(floorKey(entity, view.entityId));
    // A copy of a newer server's shape is skipped: the bootstrap's copy of the row stays.
    const parsed = parser.safeParse(view.snapshot);
    if (parsed.success) copies.set(view.entityId, parsed.data);
  }
  return copies;
}

export async function readFloorCopies(client: Pick<SyncClient, "snapshots">): Promise<FloorCopies> {
  const shown = new Set<string>();
  const areas = await copiesOf(client, FLOOR_AREA_ENTITY, posFloorAreaSchema, shown);
  const tables = await copiesOf(client, FLOOR_TABLE_ENTITY, posFloorTableSchema, shown);
  return { areas, tables, shown };
}

/** Each row in its newest copy (both versions are feed positions); gone once the feed removed it. */
function newest<T extends { readonly id: string; readonly version: number }>(
  entity: string,
  base: readonly T[],
  copies: ReadonlyMap<string, T>,
  removed: ReadonlySet<string>,
): T[] {
  const rows = new Map(base.map((row) => [row.id, row]));
  for (const [id, copy] of copies) {
    const known = rows.get(id);
    if (known === undefined || copy.version > known.version) rows.set(id, copy);
  }
  return [...rows.values()].filter((row) => !removed.has(floorKey(entity, row.id)));
}

const inOrder = (a: { sortOrder: number; name: string }, b: { sortOrder: number; name: string }) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "vi");

/**
 * The plan the floor draws without the network: the bootstrap's, with every area and table
 * change the feed brought since. Every table reads free here; the orders the till holds
 * say which are taken.
 */
export function floorPlanOf(
  base: PosFloorPlan,
  copies: FloorCopies,
  removed: ReadonlySet<string>,
): FloorOccupancy {
  const areas = newest(FLOOR_AREA_ENTITY, base.areas, copies.areas, removed).sort(inOrder);
  const areaIds = new Set(areas.map((area) => area.id));
  const tables = newest(FLOOR_TABLE_ENTITY, base.tables, copies.tables, removed)
    .filter((table) => areaIds.has(table.areaId))
    .sort(inOrder);
  return {
    areas: areas.map(({ id, name }) => ({ id, name })),
    tables: tables.map(({ id, areaId, name, seats }) => ({
      id,
      areaId,
      name,
      seats,
      status: "free" as const,
      orderId: null,
      openedAt: null,
    })),
  };
}
