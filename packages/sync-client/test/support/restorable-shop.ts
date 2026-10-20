import { provisionScratchDatabase } from "@fnb/api/test-support/provisioned-scratch-database";
import type { SyncShop } from "@fnb/api/test-support/sync-shop";
import { newId, withTenant } from "@fnb/db";
import { expect, inject } from "vitest";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import { DatabaseBackup } from "./database-backup";
import { amountDueOf } from "./order-amount-due";
import { orderOf, pay, pick, saveDraft } from "./order-commands";
import { ScenarioServer } from "./scenario-server";
import { ScenarioTill } from "./scenario-till";
import { virtualClock } from "./virtual-clock";

export const COFFEE = 29_000;
export const PEACH_TEA = 35_000;
export const PEACH_TEA_AFTER_RESTORE = 38_000;

/** Work to undo after the test, last first. */
export type Cleanups = (() => Promise<void>)[];

/** A shop on a database of its own, so it can be backed up and restored whole. */
export async function restorableShop(cleanups: Cleanups) {
  const info = inject("testPostgres");
  const database = await provisionScratchDatabase(info);
  cleanups.push(() => database.drop());
  const { server, shop } = await ScenarioServer.withShop(database.appUrl);
  cleanups.push(() => server.close());
  const dir = scratchDirectory("server-restored");
  cleanups.push(async () => dir.remove());
  const time = virtualClock();
  const tillOf = (name: string, till: SyncShop["tillA"], seed: number) => {
    const options = { dir: dir.path, name, seed, clock: time.clock };
    const scenarioTill = new ScenarioTill(server.send, till, options);
    cleanups.push(() => scenarioTill.close());
    return scenarioTill;
  };
  const backUp = async () => {
    const backup = await DatabaseBackup.take(info, database, server);
    cleanups.push(() => backup.drop());
    return backup;
  };
  return { server, shop, tillOf, backUp };
}

/** One drink, saved and paid in cash at what the till asks for at `shownPrice`. */
export async function sell(
  till: ScenarioTill,
  shop: SyncShop,
  deviceOrderNo: number,
  drink: "coffee" | "peachTea" = "coffee",
  shownPrice = drink === "coffee" ? COFFEE : PEACH_TEA,
) {
  const id = newId();
  const item =
    drink === "coffee"
      ? pick(shop.menu.coffee.id, shownPrice)
      : pick(shop.menu.peachTea.id, shownPrice, { variantId: shop.menu.peachTea.sizeM });
  await till.client.enqueue(saveDraft({ id, deviceOrderNo, base: null }, [item]));
  const shown = orderOf(await till.client.snapshot("order", id))!;
  await till.client.enqueue(pay(shown, amountDueOf(shown)));
  return id;
}

/** The backoffice raises the base price of peach tea, as the manager would. */
export async function raisePeachTea(server: ScenarioServer, shop: SyncShop) {
  const { id, sizeM, sizeL } = shop.menu.peachTea;
  const version = await withTenant(server.pool, shop.shop.tenantId, async (client) => {
    const { rows } = await client.query("SELECT version FROM product WHERE id = $1", [id]);
    return rows[0].version as number;
  });
  const response = await server.backoffice({
    method: "PUT",
    url: `/catalog/products/${id}`,
    cookie: shop.shop.managerCookie,
    payload: {
      version,
      brandId: shop.brandId,
      pricingMode: "fixed",
      taxRateBp: 800,
      kind: "prepared_drink",
      name: "Trà đào",
      basePrice: PEACH_TEA_AFTER_RESTORE,
      variants: [
        { id: sizeM, name: "M" },
        { id: sizeL, name: "L", price: 45_000 },
      ],
    },
  });
  expect(response.status).toBe(200);
}

export const peachTeaPriceShownBy = async (till: ScenarioTill, shop: SyncShop) =>
  (await till.client.snapshot("catalog_product", shop.menu.peachTea.id))?.snapshot.basePrice;

/** The resends the server noted in its audit for one till, by what it answered. */
export const resentAudits = (server: ScenarioServer, shop: SyncShop, deviceId: string) =>
  withTenant(server.pool, shop.shop.tenantId, async (client) => {
    const { rows } = await client.query(
      "SELECT payload->>'status' AS status FROM audit_log WHERE action = " +
        "'sync.command_resent_after_restore' AND entity_id = $1 ORDER BY created_at",
      [deviceId],
    );
    return rows.map((row) => row.status as string);
  });
