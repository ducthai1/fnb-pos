import { newId, withTenant } from "@fnb/db";
import type { FastifyInstance } from "fastify";
import type pg from "pg";
import { expectStatus } from "./catalog-shop";
import { pairDevice } from "./paired-devices";
import { type StaffedShop, createStaff, hire, staffedShop, startShift } from "./staffed-shop";
import { BUSINESS_DATE } from "./sync-commands";

/** A paired till with a staff member signed in, numbering its commands and orders itself. */
export interface Till {
  deviceId: string;
  deviceToken: string;
  staffToken: string;
  staffId: string;
  nextSeq: number;
  nextOrderNo: number;
  /** The cash shift the fixture opened on it, which its payments go into unless they name one. */
  shiftId?: string;
}

export interface SyncShopOptions {
  /**
   * Whether each till starts with its cash shift open on an empty drawer, as a till that
   * sells does (the server takes no payment outside a shift). Off for a test about opening
   * shifts itself.
   */
  openShifts?: boolean;
}

/** The shift syncShop opened on `till`; a test relying on one fails here when it opened none. */
export function shiftOf(till: Till): string {
  if (till.shiftId === undefined) throw new Error("the till has no shift opened by syncShop");
  return till.shiftId;
}

export interface SyncMenu {
  /** Cà phê sữa, 29.000đ, with up to two "Thêm" options; 32.000đ on the "grab" channel. */
  coffee: { id: string; extraShot: string; saltedCream: string; extrasGroup: string };
  /** Trà đào in M (35.000đ) and L (45.000đ). */
  peachTea: { id: string; sizeM: string; sizeL: string };
  /**
   * Combo sáng, 50.000đ: one drink (cà phê sữa, trà đào M, or trà đào L for 10.000đ more)
   * and up to two extra cà phê sữa at 15.000đ each.
   */
  combo: { id: string; drinkSlot: string; extraSlot: string };
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
): Promise<Till> {
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

/**
 * The till's cash shift, open on an empty drawer for the commands' business day. Written
 * directly rather than sent as shift.open: a till's outbox numbers its own commands from the
 * first, and a real till under test (the sync client's) would find that number taken.
 */
async function withOpenShift(
  pool: pg.Pool,
  tenantId: string,
  branchId: string,
  till: Till,
): Promise<Till> {
  const shiftId = newId();
  await withTenant(pool, tenantId, (client) =>
    client.query(
      "INSERT INTO shift (id, tenant_id, branch_id, device_id, status, opened_by_staff_id, " +
        "opening_cash, business_date, created_by) VALUES ($1, $2, $3, $4, 'open', $5, 0, $6, $5)",
      [shiftId, tenantId, branchId, till.deviceId, till.staffId, BUSINESS_DATE],
    ),
  );
  return { ...till, shiftId };
}

/** A shop with a small menu and a price list, set up through the backoffice API. */
export async function syncShop(
  app: FastifyInstance,
  pool: pg.Pool,
  options: SyncShopOptions = {},
): Promise<SyncShop> {
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
  const selling = async (branchId: string, till: Till) =>
    (options.openShifts ?? true) ? withOpenShift(pool, shop.tenantId, branchId, till) : till;
  return {
    shop,
    brandId,
    tillA: await selling(
      shop.branchId,
      await signedInTill(app, shop.deviceId, shop.deviceToken, cashier),
    ),
    tillB: await selling(
      shop.branchId,
      await signedInTill(app, secondTill.deviceId, secondTill.deviceToken, cashier),
    ),
    otherBranchTill: await selling(
      shop.otherBranchId,
      await signedInTill(app, otherDeviceId, shop.otherBranchDeviceToken, elsewhere.json().staffId),
    ),
    menu: await createMenu(app, shop, brandId),
  };
}

async function createMenu(app: FastifyInstance, shop: StaffedShop, brandId: string) {
  const menu: SyncMenu = {
    coffee: { id: newId(), extraShot: newId(), saltedCream: newId(), extrasGroup: newId() },
    peachTea: { id: newId(), sizeM: newId(), sizeL: newId() },
    combo: { id: newId(), drinkSlot: newId(), extraSlot: newId() },
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
  await put(`/catalog/products/${menu.combo.id}`, {
    ...product,
    kind: "combo",
    name: "Combo sáng",
    basePrice: 50_000,
    combo: {
      slots: [
        {
          id: menu.combo.drinkSlot,
          name: "Đồ uống",
          minSelect: 1,
          maxSelect: 1,
          options: [
            { productId: menu.coffee.id, variantId: null, upcharge: 0 },
            { productId: menu.peachTea.id, variantId: menu.peachTea.sizeM, upcharge: 0 },
            { productId: menu.peachTea.id, variantId: menu.peachTea.sizeL, upcharge: 10_000 },
          ],
        },
        {
          id: menu.combo.extraSlot,
          name: "Ly thêm",
          minSelect: 0,
          maxSelect: 2,
          options: [{ productId: menu.coffee.id, variantId: null, upcharge: 15_000 }],
        },
      ],
    },
  });
  return menu;
}
