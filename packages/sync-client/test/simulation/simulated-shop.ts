import { areaWithTables } from "@fnb/api/test-support/floor-plan";
import { saveSetting } from "@fnb/api/test-support/einvoice-profiles";
import { kitchenStation } from "@fnb/api/test-support/kitchen-commands";
import { pairDevice } from "@fnb/api/test-support/paired-devices";
import { freshSecret, putWebhookSecret } from "@fnb/api/test-support/payment-webhooks";
import { hire, startShift } from "@fnb/api/test-support/staffed-shop";
import type { SyncShop, Till } from "@fnb/api/test-support/sync-shop";
import type { FaultPlan } from "../support/flaky-network";
import { ScenarioServer } from "../support/scenario-server";
import { ScenarioTill } from "../support/scenario-till";
import { WorldClock } from "./world-clock";

const PIN = "4826";

export type DeviceRole = "counter" | "handheld" | "bar";

/** The POS build the shop's tills run until a deploy asks for a newer one. */
export const FIRST_POS_BUILD = 1_000;

/** One till of the shop: its local database, its clock, and the cash the cashier holds for it. */
export interface SimDevice {
  readonly name: string;
  readonly role: DeviceRole;
  readonly record: Till;
  readonly seed: number;
  readonly faults: FaultPlan;
  readonly batchSize: number;
  till: ScenarioTill;
  /** How far the till's clock is ahead of the world's, in ms (behind when negative). */
  skewMs: number;
  posBuild: number;
  /** The last running number the till gave an order. */
  lastOrderNo: number;
  shiftId: string | null;
  /** What the cashier counts in the drawer, by the shop's own book. */
  drawer: number;
}

export interface SimulatedShop {
  readonly server: ScenarioServer;
  readonly shop: SyncShop;
  readonly world: WorldClock;
  readonly dir: string;
  readonly devices: SimDevice[];
  readonly tables: string[];
  readonly stationId: string;
  readonly webhookSecret: string;
  readonly managerId: string;
}

const MILD_FAULTS: FaultPlan = {
  dropRequest: 0.02,
  dropResponse: 0.06,
  duplicate: 0.03,
  late: 0.03,
  maxFailuresInARow: 2,
};

/** Where the world's clock starts: 07:00 in Vietnam, on the first test day. */
export const FIRST_DAY_START = Date.parse("2026-10-20T00:00:00.000Z");

const tillOf = (
  server: ScenarioServer,
  device: Pick<SimDevice, "record" | "seed" | "faults" | "batchSize" | "name" | "posBuild">,
  world: WorldClock,
  dir: string,
  skewOf: () => number,
) =>
  new ScenarioTill(server.send, device.record, {
    dir,
    name: device.name,
    seed: device.seed,
    clock: world.till(skewOf),
    faults: device.faults,
    batchSize: device.batchSize,
    posBuild: device.posBuild,
  });

/** Opens (or reopens, after a restart of the app) the till's database under its build. */
export function openTill(shop: SimulatedShop, device: SimDevice): ScenarioTill {
  return tillOf(shop.server, device, shop.world, shop.dir, () => device.skewMs);
}

/** The cashier types their PIN again: at the start of a day, or when the till says the session ended. */
export async function signIn(shop: SimulatedShop, device: SimDevice): Promise<void> {
  const session = await startShift(shop.server.api, device.record.deviceToken, shop.managerId, PIN);
  if (session.status !== 201)
    throw new Error(`${device.name}: signing in answered ${session.status}`);
  device.record.staffToken = session.body.staffSessionToken;
}

export async function signInAll(shop: SimulatedShop): Promise<void> {
  for (const device of shop.devices) await signIn(shop, device);
}

/**
 * A branch with two counters, a handheld for the tables and a bar till, on the real API.
 * Every one is signed in as a manager, who can discount, refund and void without a second
 * person's approval (approvals have their own tests); the server's clock is the world's.
 */
export async function openShop(seed: number, dir: string): Promise<SimulatedShop> {
  const world = new WorldClock(FIRST_DAY_START);
  const { server, shop } = await ScenarioServer.withShop(
    undefined,
    { openShifts: false },
    { clock: world.server(), fakeGateway: true },
  );
  const api = server.api;
  const managerId = await hire(api, shop.shop, PIN, shop.shop.roleIds.manager);
  const settings = { scopeKind: "branch", scopeId: shop.shop.branchId } as const;
  // A manager takes back a drink the bar already has without asking another manager.
  await saveSetting(
    server.pool,
    shop.shop.tenantId,
    settings,
    "void_after_sent_needs_approval",
    false,
  );
  const floor = await areaWithTables(api, shop.shop.managerCookie, shop.shop.branchId, [
    "B01",
    "B02",
    "B03",
    "B04",
    "B05",
    "B06",
  ]);
  const stationId = await kitchenStation(api, shop, "Pha chế");
  const webhookSecret = freshSecret();
  const stored = await putWebhookSecret(
    api,
    shop.shop.managerCookie,
    shop.shop.branchId,
    "fake",
    webhookSecret,
  );
  if (stored.statusCode >= 300)
    throw new Error(`storing the webhook secret answered ${stored.statusCode}`);

  const second = await pairDevice(
    api,
    shop.shop.managerCookie,
    shop.shop.branchId,
    "Máy order bàn",
  );
  const third = await pairDevice(api, shop.shop.managerCookie, shop.shop.branchId, "Máy pha chế");
  const record = (deviceId: string, deviceToken: string): Till => ({
    deviceId,
    deviceToken,
    staffToken: "",
    staffId: managerId,
    nextSeq: 1,
    nextOrderNo: 1,
  });
  const make = (
    name: string,
    role: DeviceRole,
    till: Till,
    index: number,
    batchSize: number,
  ): SimDevice => {
    const device: SimDevice = {
      name,
      role,
      record: till,
      seed: seed * 100 + index * 10,
      faults: MILD_FAULTS,
      batchSize,
      till: undefined as never,
      skewMs: 0,
      posBuild: FIRST_POS_BUILD,
      lastOrderNo: 0,
      shiftId: null,
      drawer: 0,
    };
    return device;
  };
  const devices = [
    make("counter-1", "counter", record(shop.tillA.deviceId, shop.tillA.deviceToken), 1, 5),
    make("counter-2", "counter", record(shop.tillB.deviceId, shop.tillB.deviceToken), 2, 20),
    make("handheld", "handheld", record(second.deviceId, second.deviceToken), 3, 10),
    make("bar", "bar", record(third.deviceId, third.deviceToken), 4, 50),
  ];
  const opened: SimulatedShop = {
    server,
    shop,
    world,
    dir,
    devices,
    tables: floor.tableIds,
    stationId,
    webhookSecret,
    managerId,
  };
  for (const device of devices) device.till = openTill(opened, device);
  await signInAll(opened);
  return opened;
}
