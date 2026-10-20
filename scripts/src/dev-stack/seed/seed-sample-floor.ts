import { type BackofficeCall, ensureNamed } from "./backoffice-caller";

const AREAS = [
  { name: "Trong nhà", prefix: "T" },
  { name: "Sân vườn", prefix: "S" },
] as const;
const TABLES_PER_AREA = 6;

/** Two areas of six tables each, laid out three to a row, through the floor plan routes. */
export async function seedSampleFloor(call: BackofficeCall, branchId: string): Promise<number> {
  const areas = await ensureNamed(
    call,
    `/floor/areas?branchId=${branchId}`,
    AREAS.map((area, index) => ({ ...area, index })),
    (id, area) =>
      call("PUT", `/floor/areas/${id}`, {
        version: null,
        branchId,
        name: area.name,
        sortOrder: area.index,
      }),
  );
  const tables = AREAS.flatMap((area) =>
    Array.from({ length: TABLES_PER_AREA }, (_, index) => ({
      name: `${area.prefix}${String(index + 1).padStart(2, "0")}`,
      areaId: areas.get(area.name),
      index,
    })),
  );
  const seeded = await ensureNamed(call, `/floor/tables?branchId=${branchId}`, tables, (id, t) =>
    call("PUT", `/floor/tables/${id}`, {
      version: null,
      areaId: t.areaId,
      name: t.name,
      x: 40 + (t.index % 3) * 120,
      y: 40 + Math.floor(t.index / 3) * 120,
      width: 80,
      height: 80,
      shape: "rectangle",
      seats: 4,
      sortOrder: t.index,
    }),
  );
  return seeded.size;
}
