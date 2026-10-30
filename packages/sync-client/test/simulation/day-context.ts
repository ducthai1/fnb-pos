import type { SyncCommandEnvelope } from "@fnb/contracts";
import type { LocalCommand } from "../../src";
import { type OrderView, type PickedItem, orderOf, pick } from "../support/order-commands";
import type { SeededRandom } from "../support/seeded-random";
import type { ShopBooks } from "./shop-books";
import type { SimDevice, SimulatedShop } from "./simulated-shop";

/** One thing a till's cashier does later: it runs once due, and again each tick until it is done. */
export interface Task {
  readonly label: string;
  readonly dueMs: number;
  run(): Promise<boolean>;
}

export interface DayWindow {
  readonly businessDate: string;
  readonly openMs: number;
  readonly closeMs: number;
  readonly tickMs: number;
}

/** Free text a cashier types for the bar: odd characters, long lines, markup. */
const NOTES = [
  null,
  null,
  null,
  "ít đá",
  "ít ngọt, thêm đá, không ống hút",
  "Không đường <b>&</b> 'nhiều' \"đá\" 🧋",
  "ghi chú dài ".repeat(30).trim(),
];

/** What the shop's days are made of: the context the actions of one day share. */
export class DayContext {
  readonly tasks: Task[] = [];

  constructor(
    readonly shop: SimulatedShop,
    readonly books: ShopBooks,
    readonly random: SeededRandom,
    readonly window: DayWindow,
  ) {}

  now(): number {
    return this.shop.world.now();
  }

  device(name: string): SimDevice {
    const found = this.shop.devices.find((device) => device.name === name);
    if (found === undefined) throw new Error(`no device ${name}`);
    return found;
  }

  counters(): SimDevice[] {
    return this.shop.devices.filter((device) => device.role === "counter");
  }

  /** The till records the command at its own clock, which may be skewed. */
  async send(device: SimDevice, command: LocalCommand): Promise<SyncCommandEnvelope> {
    this.books.commandsIssued += 1;
    const createdAt = new Date(this.now() + device.skewMs).toISOString();
    return device.till.client.enqueue({
      ...command,
      createdAt,
      businessDate: this.window.businessDate,
    });
  }

  async shown(device: SimDevice, orderId: string): Promise<OrderView | null> {
    return orderOf(await device.till.client.snapshot("order", orderId));
  }

  /** The order as a cashier opens it to edit: the server's copy once none of the till's own commands wait on it. */
  async openable(device: SimDevice, orderId: string): Promise<OrderView | null> {
    const view = await device.till.client.snapshot("order", orderId);
    if (view === null) return null;
    if (view.source !== "server" && device.till.network.online) return null;
    return orderOf(view);
  }

  after(minutes: number, label: string, run: () => Promise<boolean>): void {
    this.tasks.push({ label, dueMs: this.now() + minutes * 60_000, run });
  }

  nextOrderNo(device: SimDevice): number {
    device.lastOrderNo += 1;
    return device.lastOrderNo;
  }

  /** One item as the shop sells it: a coffee with toppings, or a tea in a size; sometimes a bulk order. */
  item(): PickedItem {
    const { coffee, peachTea } = this.shop.shop.menu;
    const note = this.random.pick(NOTES);
    const quantity = this.random.chance(0.03)
      ? String(this.random.int(20, 60))
      : String(this.random.int(1, 3));
    const kind = this.random.int(0, 3);
    if (kind === 0) {
      const topping = this.random.chance(0.5)
        ? { optionId: coffee.extraShot, shownPrice: 10_000 }
        : { optionId: coffee.saltedCream, shownPrice: 7_000 };
      return pick(coffee.id, 29_000, {
        quantity,
        note,
        modifiers: [{ groupId: coffee.extrasGroup, quantity: 1, ...topping }],
      });
    }
    if (kind === 1) return pick(coffee.id, 29_000, { quantity, note });
    if (kind === 2) return pick(peachTea.id, 35_000, { variantId: peachTea.sizeM, quantity, note });
    return pick(peachTea.id, 45_000, { variantId: peachTea.sizeL, quantity, note });
  }
}
