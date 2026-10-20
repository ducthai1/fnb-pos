import { type Vnd, divideRounded, vnd } from "@fnb/domain";
import type { DailySalesReport } from "../api/reports-api";

/**
 * What the day's cards show, read off the server's report. Only the average is worked out
 * here, and it goes through the domain's division (whole đồng, half up); every other figure
 * is the report's own.
 */
export function averageOrder(report: DailySalesReport): Vnd | null {
  const { orderCount, collected } = report.sales;
  if (orderCount === 0) return null;
  return vnd(divideRounded(BigInt(collected), BigInt(orderCount), "half-up"));
}

/** What a method brought in after its refunds, or 0 when nobody paid that way. */
export function methodNet(report: DailySalesReport, method: string): number {
  return report.payments.find((payment) => payment.method === method)?.net ?? 0;
}

export type DayItem = DailySalesReport["items"][number];

/** The goods sold most by units (toppings and combo parts left out), most first, then by name. */
export function topItems(report: DailySalesReport, count: number): DayItem[] {
  return report.items
    .filter((item) => item.lineType === "item")
    .map((item, index) => ({ item, index, units: Number(item.quantity) }))
    .sort(
      (a, b) =>
        b.units - a.units || a.item.name.localeCompare(b.item.name, "vi") || a.index - b.index,
    )
    .slice(0, count)
    .map(({ item }) => item);
}

export interface HourBar {
  readonly hour: number;
  readonly orderCount: number;
  readonly collected: number;
}

/** The hour a business day starts at on the default branch clock (04:00). */
const DAY_START_HOUR = 4;
const order = (hour: number) => (hour - DAY_START_HOUR + 24) % 24;

/**
 * One bar per hour in the order the business day runs (04:00 to 03:00), from 06:00 to
 * 22:00 at least, wider when a sale fell outside that; hours without a sale are empty bars.
 */
export function hourBars(byHour: DailySalesReport["byHour"]): HourBar[] {
  const sold = new Map(byHour.map((row) => [row.hour, row]));
  const positions = [order(6), order(22), ...byHour.map((row) => order(row.hour))];
  const first = Math.min(...positions);
  const last = Math.max(...positions);
  const bars: HourBar[] = [];
  for (let step = first; step <= last; step += 1) {
    const hour = (step + DAY_START_HOUR) % 24;
    const row = sold.get(hour);
    bars.push({ hour, orderCount: row?.orderCount ?? 0, collected: row?.collected ?? 0 });
  }
  return bars;
}

/** The hour that brought in the most (the earlier one on a tie), or null on a day with no sale. */
export function busiestHour(byHour: readonly HourBar[]): HourBar | null {
  let best: HourBar | null = null;
  for (const row of byHour) {
    if (row.collected <= 0) continue;
    if (best === null || row.collected > best.collected) best = row;
  }
  return best;
}
