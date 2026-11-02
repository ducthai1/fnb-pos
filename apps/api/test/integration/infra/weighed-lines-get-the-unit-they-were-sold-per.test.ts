import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { runMigrations } from "@fnb/db";
import type pg from "pg";
import { afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import {
  type MigrationDirectory,
  type ScratchDatabase,
  createMigrationDirectory,
  createScratchDatabase,
} from "../support/scratch-database";
import { withClient } from "../support/with-client";

const info = inject("testPostgres");
const MIGRATIONS = path.resolve(import.meta.dirname, "../../../../../packages/db/migrations");
const T = "0199f000-0000-7000-8000-00000000a001";
const BRAND = "0199f000-0000-7000-8000-00000000a002";
const BRANCH = "0199f000-0000-7000-8000-00000000a003";
const DEVICE = "0199f000-0000-7000-8000-00000000a004";
const SWITCHED = "0199f000-0000-7000-8000-00000000b001";
const OLD_KG = "0199f000-0000-7000-8000-00000000b002";
const CUP = "0199f000-0000-7000-8000-00000000b003";
const OPEN = "0199f000-0000-7000-8000-00000000c001";
const CANCELLED = "0199f000-0000-7000-8000-00000000c002";

let scratch: ScratchDatabase;
let directory: MigrationDirectory;

beforeEach(async () => {
  scratch = await createScratchDatabase(info);
  directory = await createMigrationDirectory();
});

afterEach(async () => {
  await scratch.drop();
  await directory.remove();
});

async function copyMigrations(before: string) {
  const names = (await readdir(MIGRATIONS)).filter((name) => name.endsWith(".sql")).sort();
  const files: Record<string, string> = {};
  for (const name of names.filter((n) => n < before)) {
    files[name] = await readFile(path.join(MIGRATIONS, name), "utf8");
  }
  await directory.write(files);
}

const inTenant = (work: (client: pg.Client) => Promise<unknown>) =>
  withClient(scratch.ownerUrl, async (client) => {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [T]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  });

/** The product's copy in the feed at `at`, as the catalog writes it since 0036. */
const productCopy = (client: pg.Client, productId: string, unit: string | null, at: string) =>
  client.query(
    "INSERT INTO change_log (id, tenant_id, branch_id, entity, entity_id, snapshot, created_at) " +
      "VALUES (gen_random_uuid(), $1, $2, 'catalog_product', $3, $4::jsonb, $5)",
    [T, BRANCH, productId, JSON.stringify({ id: productId, measureUnit: unit }), at],
  );

const lineOf = (client: pg.Client, order: string, row: [string, string, string, string | null, string]) =>
  client.query(
    "INSERT INTO sales_order_line (id, tenant_id, order_id, position, line_type, product_id, " +
      "name_snapshot, unit_price, quantity, tax_rate_bp, price_source, reverses_line_id, created_at) " +
      "VALUES ($1, $2, $3, 0, 'item', $4, 'x', 1000, $5, 0, 'base', $6, $7)",
    [row[0], T, order, row[1], row[2], row[3], row[4]],
  );

describe("the migration that keeps a weighed line's unit", () => {
  it("gives each old weighed line the unit its product had when it was sold, and nothing else one", async () => {
    await copyMigrations("0042");
    await runMigrations(scratch.ownerUrl, { directory: directory.path });
    await inTenant(async (client) => {
      await client.query("INSERT INTO organization (id, tenant_id, name) VALUES ($1, $1, 'Quán')", [T]);
      await client.query("INSERT INTO brand (id, tenant_id, name) VALUES ($1, $2, 'Quán')", [BRAND, T]);
      await client.query(
        "INSERT INTO branch (id, tenant_id, brand_id, name) VALUES ($1, $2, $3, 'Quận 1')",
        [BRANCH, T, BRAND],
      );
      await client.query("INSERT INTO device (id, tenant_id, branch_id, name) VALUES ($1, $2, $3, 'Quầy')", [
        DEVICE,
        T,
        BRANCH,
      ]);
      const product = (id: string, mode: string, unit: string | null) =>
        client.query(
          "INSERT INTO product (id, tenant_id, brand_id, kind, name, pricing_mode, measure_unit, code) " +
            "VALUES ($1, $2, $3, 'retail_item', 'x', $4, $5, $6)",
          [id, T, BRAND, mode, unit, `SP${id.slice(-4)}`],
        );
      await product(SWITCHED, "weighed", "100g");
      await product(OLD_KG, "weighed", "100g");
      await product(CUP, "fixed", null);
      // Sold per kg until 10:00, per 100 g after; the other one has no copy in the feed at all.
      await productCopy(client, SWITCHED, "kg", "2026-10-20T01:00:00Z");
      await productCopy(client, SWITCHED, "100g", "2026-10-20T03:00:00Z");
      for (const [id, status] of [
        [OPEN, "draft"],
        [CANCELLED, "draft"],
      ] as const) {
        await client.query(
          "INSERT INTO sales_order (id, tenant_id, branch_id, device_id, status, service_type, " +
            "business_date, device_order_no, charge_profile) VALUES ($1, $2, $3, $4, $5, 'takeaway', " +
            "'2026-10-20', $6, '{}')",
          [id, T, BRANCH, DEVICE, status, id === OPEN ? 1 : 2],
        );
      }
      await lineOf(client, OPEN, ["0199f000-0000-7000-8000-00000000d001", SWITCHED, "0.35", null, "2026-10-20T02:00:00Z"]);
      await lineOf(client, OPEN, ["0199f000-0000-7000-8000-00000000d002", SWITCHED, "3.5", null, "2026-10-20T04:00:00Z"]);
      await lineOf(client, OPEN, ["0199f000-0000-7000-8000-00000000d003", OLD_KG, "1.2", null, "2026-10-20T04:00:00Z"]);
      await lineOf(client, OPEN, ["0199f000-0000-7000-8000-00000000d004", CUP, "2", null, "2026-10-20T04:00:00Z"]);
      // A cancel line written after the switch takes back units of the per-kg line.
      await lineOf(client, CANCELLED, [
        "0199f000-0000-7000-8000-00000000d005",
        SWITCHED,
        "-0.35",
        "0199f000-0000-7000-8000-00000000d001",
        "2026-10-20T05:00:00Z",
      ]);
      // A closed order: its lines refuse changes, and still get their label.
      await client.query("UPDATE sales_order SET status = 'cancelled' WHERE id = $1", [CANCELLED]);
    });

    await copyMigrations("0043");
    await runMigrations(scratch.ownerUrl, { directory: directory.path });
    const units = await inTenant(async (client) => {
      const { rows } = await client.query<{ id: string; measure_unit: string | null }>(
        "SELECT id, measure_unit FROM sales_order_line ORDER BY id",
      );
      return rows.map((row) => [row.id.slice(-4), row.measure_unit]);
    });
    expect(units).toEqual([
      ["d001", "kg"],
      ["d002", "100g"],
      ["d003", "kg"],
      ["d004", null],
      ["d005", "kg"],
    ]);
    // Still closed: changing a line of the cancelled order is refused as before.
    const refused = await inTenant((client) =>
      client
        .query("UPDATE sales_order_line SET note = 'x' WHERE order_id = $1", [CANCELLED])
        .then(() => "changed", () => "refused"),
    ).catch(() => "refused");
    expect(refused).toBe("refused");
  });
});
