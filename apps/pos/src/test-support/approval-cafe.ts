import { ROLE_TEMPLATES } from "@fnb/domain";
import { fireEvent, screen, within } from "@testing-library/react";
import { vi as text } from "../messages/vi";
import type { fakeServer } from "./fake-pos-server";
import { LAN, cafeServer } from "./signed-in-till";
import { tableCafeServer } from "./table-cafe-server";
import { tid } from "./till-fixtures";

/** The manager on duty, who approves on Lan's till with her PIN. */
export const MINH = { id: tid(0x51a2), displayName: "Minh", active: true };
export const MINH_PIN = "2468";

/** Lan as the cashier template makes her: 10% off an item, 500.000 đ of cash moves alone. */
export function staffAsCashierAndManager(server: ReturnType<typeof fakeServer>) {
  server.state.pins.set(MINH.id, MINH_PIN);
  server.state.grants.set(LAN.id, [...ROLE_TEMPLATES.cashier.grants]);
  server.state.grants.set(MINH.id, [...ROLE_TEMPLATES.manager.grants]);
  return server;
}

/** The pilot café with Lan at the counter and Minh to approve. */
export const counterWithManager = () => staffAsCashierAndManager(cafeServer([LAN, MINH]));

/** The café serving at tables, Lan at the till and Minh to approve. */
export const tablesWithManager = (settings: Record<string, unknown> = {}) =>
  staffAsCashierAndManager(tableCafeServer(true, settings, [LAN, MINH]));

export const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

/** Minh approves on the sheet: picks his name, types his PIN. */
export async function managerApproves(pin = MINH_PIN) {
  await screen.findByRole("heading", { name: text.approval.title });
  tap(MINH.displayName);
  for (const digit of pin) tap(digit);
  tap(text.approval.approve);
}

export const pushedOf = (server: ReturnType<typeof fakeServer>, type: string) =>
  server.state.pushed.filter((command) => command.type === type);

export const cart = () => within(screen.getByRole("region", { name: text.sale.cartLabel }));

/** The amount due the cart shows, read off the element that shows it. */
export const amountDue = () =>
  document.querySelector("[data-amount-due]")?.getAttribute("data-amount-due") ?? null;
