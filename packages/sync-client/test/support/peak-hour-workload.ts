import type { SyncShop } from "@fnb/api/test-support/sync-shop";
import { newId } from "@fnb/db";
import type { SyncReport } from "../../src";
import { amountDueOf } from "./order-amount-due";
import { type PickedItem, itemsOf, orderOf, pay, pick, saveDraft } from "./order-commands";
import type { ScenarioTill } from "./scenario-till";

/** A counter order its till has finished, on its way to the other till to be paid. */
interface Handover {
  orderId: string;
  to: ScenarioTill;
  arrivesAtTick: number;
  /** The version the order had when its till handed it over. */
  version: number;
}

interface OwnOrder {
  deviceOrderNo: number;
  /** The command that finished the order; it is handed over once that is accepted. */
  finishedBy: string | null;
}

export interface PeakHourOptions {
  /** Ticks between handing an order over and its customer reaching the other till. */
  handoverDelay: number;
}

/**
 * Two tills at a busy hour, both writing all the time: each opens counter orders, finishes
 * them, and hands them to the other till for payment; both keep adding drinks to the same few
 * table orders. Each tick both tills work and sync at the same time. Nothing here can make a
 * command conflict except a till acting on data it should have pulled already.
 */
export class PeakHour {
  readonly passes = new Map<ScenarioTill, SyncReport[]>();
  readonly regressions: string[] = [];
  /** Handed-over orders not shown at the version they were handed over at when paid. */
  readonly stale: { orderId: string; shown: number | null; expected: number }[] = [];
  /** Handed-over orders the other till took payment for. */
  readonly paid: string[] = [];
  handedOver = 0;
  private tick = 0;
  private readonly own = new Map<ScenarioTill, Map<string, OwnOrder>>();
  private readonly arriving: Handover[] = [];
  private readonly seen = new Map<string, number>();
  private nextOrderNo = new Map<ScenarioTill, number>();

  constructor(
    private readonly shop: SyncShop,
    private readonly tills: readonly [ScenarioTill, ScenarioTill],
    private readonly tables: readonly string[],
    private readonly options: PeakHourOptions,
  ) {
    for (const till of tills) {
      this.own.set(till, new Map());
      this.passes.set(till, []);
      this.nextOrderNo.set(till, 100);
    }
  }

  /** Handed over too late in the run for their customer to reach the other till. */
  get stillArriving(): number {
    return this.arriving.length;
  }

  async run(ticks: number): Promise<void> {
    const [a, b] = this.tills;
    for (; this.tick < ticks; this.tick += 1) {
      await Promise.all([this.step(a, b), this.step(b, a)]);
    }
  }

  private item(till: ScenarioTill): PickedItem {
    const { coffee, peachTea } = this.shop.menu;
    return till.random.pick([
      pick(coffee.id, 29_000),
      pick(peachTea.id, 35_000, { variantId: peachTea.sizeM }),
      pick(peachTea.id, 45_000, { variantId: peachTea.sizeL }),
    ]);
  }

  private async openOrder(till: ScenarioTill): Promise<void> {
    const deviceOrderNo = this.nextOrderNo.get(till)!;
    this.nextOrderNo.set(till, deviceOrderNo + 1);
    const orderId = newId();
    this.own.get(till)!.set(orderId, { deviceOrderNo, finishedBy: null });
    await till.client.enqueue(
      saveDraft({ id: orderId, deviceOrderNo, base: null }, [this.item(till)]),
    );
  }

  /** Saves the order as the till shows it plus one more item. */
  private async addItem(till: ScenarioTill, orderId: string): Promise<string> {
    const base = orderOf(await till.client.snapshot("order", orderId))!;
    const command = saveDraft({ id: orderId, deviceOrderNo: base.deviceOrderNo, base }, [
      ...itemsOf(base),
      this.item(till),
    ]);
    return (await till.client.enqueue(command)).commandId;
  }

  private async step(till: ScenarioTill, other: ScenarioTill): Promise<void> {
    if (till.random.chance(0.6)) await this.openOrder(till);
    const unfinished = [...this.own.get(till)!].filter(([, order]) => order.finishedBy === null);
    if (unfinished.length > 1) {
      const [orderId, order] = unfinished[0]!;
      order.finishedBy = await this.addItem(till, orderId);
    }
    if (till.random.chance(0.5)) await this.addItem(till, till.random.pick(this.tables));
    await this.payArrivals(till);
    // The cashier keeps ringing up while the till syncs.
    const pass = till.client.syncOnce();
    await this.openOrder(till);
    const report = await pass;
    this.passes.get(till)!.push(report);
    await this.handOver(till, other, report);
    await this.observeVersions(till);
  }

  private async payArrivals(till: ScenarioTill): Promise<void> {
    for (const handover of this.arriving.filter(
      (h) => h.to === till && h.arrivesAtTick <= this.tick,
    )) {
      this.arriving.splice(this.arriving.indexOf(handover), 1);
      const view = await till.client.snapshot("order", handover.orderId);
      if (view?.serverVersion !== handover.version) {
        this.stale.push({
          orderId: handover.orderId,
          shown: view?.serverVersion ?? null,
          expected: handover.version,
        });
      }
      const order = orderOf(view);
      // The cashier charges what the screen shows, current or not.
      if (order === null) continue;
      await till.client.enqueue(pay(order, amountDueOf(order)));
      this.paid.push(handover.orderId);
    }
  }

  private async handOver(
    till: ScenarioTill,
    other: ScenarioTill,
    report: SyncReport,
  ): Promise<void> {
    for (const [orderId, order] of this.own.get(till)!) {
      if (order.finishedBy === null || !report.accepted.includes(order.finishedBy)) continue;
      const version = (await till.client.snapshot("order", orderId))?.serverVersion ?? 0;
      this.arriving.push({
        orderId,
        to: other,
        arrivesAtTick: this.tick + this.options.handoverDelay,
        version,
      });
      this.own.get(till)!.delete(orderId);
      this.handedOver += 1;
    }
  }

  /** Records any row whose newest server version went down since the till last showed it. */
  private async observeVersions(till: ScenarioTill): Promise<void> {
    for (const view of await till.client.snapshots("order")) {
      if (view.serverVersion === null) continue;
      const key = `${till.till.deviceId}/${view.entityId}`;
      const before = this.seen.get(key) ?? 0;
      if (view.serverVersion < before)
        this.regressions.push(`${key}: ${before} -> ${view.serverVersion}`);
      this.seen.set(key, Math.max(before, view.serverVersion));
    }
  }
}
