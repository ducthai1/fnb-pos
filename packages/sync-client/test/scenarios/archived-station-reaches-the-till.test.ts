import { milkTeaTillShop } from "@fnb/api/test-support/milk-tea-till-shop";
import { buildApp } from "@fnb/api/build-app";
import { newId } from "@fnb/db";
import { testConnectionString } from "@fnb/db/test-support";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { scratchDirectory } from "../../src/local-store/local-store-test-support";
import { injectHttpSend } from "../support/inject-http-send";
import { ScenarioTill } from "../support/scenario-till";
import { virtualClock } from "../support/virtual-clock";

// On a real disk under the package (see scratchDirectory): the till's writes fsync.
const dir = scratchDirectory("archived-station");
let pool: pg.Pool;
let app: ReturnType<typeof buildApp>;
let shop: Awaited<ReturnType<typeof milkTeaTillShop>>;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: testConnectionString(inject("testPostgres"), "app") });
  app = buildApp({ pool });
  shop = await milkTeaTillShop(app, pool);
});

afterAll(async () => {
  await app.close();
  await pool.end();
  dir.remove();
});

const till = (name: string, seed: number) =>
  new ScenarioTill(injectHttpSend(app), shop.s.tillA, {
    dir: dir.path,
    name,
    seed,
    clock: virtualClock().clock,
  });

const stationsOn = async (on: ScenarioTill) =>
  (await on.client.snapshots("catalog_station")).map((view) => view.entityId);

describe("a station the shop took off its list", () => {
  it("leaves the till the way a deleted one does, on the pull after, offline or not", async () => {
    const online = till("online", 31);
    const away = till("away", 32);
    await online.syncUntilIdle();
    await away.syncUntilIdle();
    // A station nothing ever pointed at is deleted; the bar of the menu has history, so archived.
    const spare = newId();
    await shop.manage("PUT", `/catalog/stations/${spare}`, {
      version: null,
      branchId: shop.s.shop.branchId,
      name: "Quầy tạm",
    });
    await online.syncUntilIdle();
    await away.syncUntilIdle();
    for (const held of [online, away]) {
      expect(await stationsOn(held)).toEqual(expect.arrayContaining([spare, shop.stationId]));
    }

    away.network.online = false;
    await shop.manage("DELETE", `/catalog/stations/${spare}?version=1`);
    await shop.manage("POST", `${shop.tea.url}/archive`);
    expect(
      await shop.manage("DELETE", `/catalog/stations/${shop.stationId}?version=1`),
    ).toMatchObject({
      outcome: "archived",
    });

    await online.syncUntilIdle();
    expect(await stationsOn(online)).not.toContain(spare);
    expect(await stationsOn(online)).not.toContain(shop.stationId);
    // The till that was away still has both until it is back, then drops both.
    expect(await stationsOn(away)).toEqual(expect.arrayContaining([spare, shop.stationId]));
    away.network.online = true;
    await away.syncUntilIdle();
    expect(await stationsOn(away)).not.toContain(spare);
    expect(await stationsOn(away)).not.toContain(shop.stationId);
    await online.close();
    await away.close();
  });
});
