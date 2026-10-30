import { newId } from "@fnb/db";
import type { DayContext } from "./day-context";
import { SMALLEST_NOTE, closeShiftCounting, moveCash, openShiftWith } from "./sim-commands";
import type { SimDevice } from "./simulated-shop";

const OPENING_CASH = 500_000;

/** Each counter's cashier opens a drawer of 500.000 đ in notes. */
export async function openDrawers(ctx: DayContext): Promise<void> {
  for (const device of ctx.counters()) {
    const shiftId = newId();
    await ctx.send(device, openShiftWith(shiftId, OPENING_CASH));
    device.shiftId = shiftId;
    device.drawer = OPENING_CASH;
    ctx.books.shifts.push({ device: device.name, shiftId, opening: OPENING_CASH, counted: null });
  }
}

/** Ice and milk paid out of the drawer. */
export async function payOutOfDrawer(
  ctx: DayContext,
  device: SimDevice,
  amount: number,
): Promise<void> {
  if (device.shiftId === null) return;
  await ctx.send(device, moveCash(device.shiftId, "out", amount, "Trả tiền đá"));
  device.drawer -= amount;
}

/**
 * The cashier counts the drawer. Change below the smallest note goes to the safe first, as
 * it does in a real close, so that the notes counted are a whole count of the drawer.
 */
export async function closeDrawers(ctx: DayContext): Promise<void> {
  for (const device of ctx.counters()) {
    if (device.shiftId === null) continue;
    const odd = device.drawer % SMALLEST_NOTE;
    if (odd > 0) await payOutOfDrawer(ctx, device, odd);
    await ctx.send(device, closeShiftCounting(device.shiftId, device.drawer));
    const booked = ctx.books.shifts.find((shift) => shift.shiftId === device.shiftId);
    if (booked !== undefined) booked.counted = device.drawer;
    device.shiftId = null;
  }
}
