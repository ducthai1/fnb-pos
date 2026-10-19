import { newId, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { expectStatus } from "./catalog-shop";
import { pairDevice } from "./paired-devices";
import { type StaffedShop, createStaff, hire, staffedShop, startShift } from "./staffed-shop";

/** A paired till with a staff member signed in, numbering its commands and orders itself. */
export interface Till {
  deviceId: string;
  deviceToken: string;
  staffToken: string;
  staffId: string;
  nextSeq: number;
  nextOrderNo: number;
}

export interface SyncMenu {
  /** Cà phê sữa, 29.000đ, with up to two "Thêm" options; 32.000đ on the "grab" channel. */
  coffee: { id: string; extraShot: string; saltedCream: string; extrasGroup: string };
  /** Trà đào in M (35.000đ) and L (45.000đ). */
  peachTea: { id: string; sizeM: string; sizeL: string };
  /** A combo product, which drafts cannot carry yet. */
  combo: string;
}

export interface SyncShop {
  shop: StaffedShop;
  brandId: string;
  /** Two tills of shop.branchId, and one of shop.otherBranchId. */
  tillA: Till;
  tillB: Till;
  otherBranchTill: Till;
  menu: SyncMenu;
}

const PIN = "4826";

async function signedInTill(
  app: FastifyInstance,
  deviceId: string,
  token: string,
  staffId: string,
) {
  const shift = await startShift(app, token, staffId, PIN);
  if (shift.status !== 201) throw new Error(`starting a shift answered ${shift.status}`);
  return {
    deviceId,
    deviceToken: token,
    staffToken: shift.body.staffSessionToken,
    staffId,
    nextSeq: 1,
    nextOrderNo: 1,
  };
}

/** A shop with a small menu and a price list, set up through the backoffice API. */
export async function syncShop(app: FastifyInstance, pool: pg.Pool): Promise<SyncShop> {
  const shop = await staffedShop(app, pool);
  const brandId = await withTenant(pool, shop.tenantId, async (client) => {
    const { rows } = await client.query("SELECT brand_id FROM branch WHERE id = $1", [
      shop.branchId,
    ]);
    return rows[0].brand_id as string;
  });
  const cashier = await hire(app, shop, PIN);
  const elsewhere = await createStaff(app, shop, { pin: PIN, branchIds: [shop.otherBranchId] });
  const secondTill = await pairDevice(app, shop.managerCookie, shop.branchId, "Quầy 2");
  const otherDeviceId = await withTenant(pool, shop.tenantId, async (client) => {
    const { rows } = await client.query("SELECT id FROM device WHERE branch_id = $1", [
      shop.otherBranchId,
    ]);
    return rows[0].id as string;
  });
  return {
    shop,
    brandId,
    tillA: await signedInTill(app, shop.deviceId, shop.deviceToken, cashier),
    tillB: await signedInTill(app, secondTill.deviceId, secondTill.deviceToken, cashier),
    otherBranchTill: await signedInTill(
      app,
      otherDeviceId,
      shop.otherBranchDeviceToken,
      elsewhere.json().staffId,
    ),
    menu: await createMenu(app, pool, shop, brandId),
  };
}

async function createMenu(app: FastifyInstance, pool: pg.Pool, shop: StaffedShop, brandId: string) {
  const menu: SyncMenu = {
    coffee: { id: newId(), extraShot: newId(), saltedCream: newId(), extrasGroup: newId() },
    peachTea: { id: newId(), sizeM: newId(), sizeL: newId() },
    combo: newId(),
  };
  const put = (url: string, payload: object, status = 201) =>
    expectStatus(
      app.inject({ method: "PUT", url, headers: { cookie: shop.managerCookie }, payload }),
      status,
    );
  const product = { version: null, brandId, pricingMode: "fixed", taxRateBp: 800 };
  await put(`/catalog/products/${menu.coffee.id}`, {
    ...product,
    kind: "prepared_drink",
    name: "Cà phê sữa",
    basePrice: 29_000,
    modifierGroups: [
      {
        id: menu.coffee.extrasGroup,
        name: "Thêm",
        minSelect: 0,
        maxSelect: 2,
        allowDuplicates: true,
        options: [
          { id: menu.coffee.extraShot, name: "Thêm shot", priceDelta: 10_000 },
          { id: menu.coffee.saltedCream, name: "Kem muối", priceDelta: 7_000 },
        ],
      },
    ],
  });
  await put(`/catalog/products/${menu.peachTea.id}`, {
    ...product,
    kind: "prepared_drink",
    name: "Trà đào",
    basePrice: 35_000,
    variants: [
      { id: menu.peachTea.sizeM, name: "M" },
      { id: menu.peachTea.sizeL, name: "L", price: 45_000 },
    ],
  });
  await put(`/catalog/price-lists/${newId()}`, {
    version: null,
    brandId,
    name: "Giá Grab",
    items: [
      {
        id: newId(),
        scope: { kind: "product", productId: menu.coffee.id },
        channelKey: "grab",
        effect: { kind: "fixed_price", price: 32_000 },
      },
    ],
  });
  // Written directly: a combo's slots do not matter to a draft that refuses combos.
  await withTenant(pool, shop.tenantId, (client) =>
    client.query(
      "INSERT INTO product (id, tenant_id, brand_id, kind, name, base_price, pricing_mode) " +
        "VALUES ($1, $2, $3, 'combo', 'Combo sáng', 50000, 'fixed')",
      [menu.combo, shop.tenantId, brandId],
    ),
  );
  return menu;
}
