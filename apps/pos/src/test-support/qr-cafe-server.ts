import { PAYMENT_INTENT_ENTITY } from "@fnb/contracts";
import { formatVnd, vnd } from "@fnb/domain";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect } from "vitest";
import { vi as text } from "../messages/vi";
import { fakeServer } from "./fake-pos-server";
import { LAN } from "./signed-in-till";
import { tillBootstrap, tillBootstrapWire } from "./till-fixtures";

/** The café's account, as the backoffice stores the branch's payment_account setting. */
export const SHOP_ACCOUNT = {
  bankBin: "970436",
  accountNumber: "0011001234567",
  accountName: "CA PHE MAY",
} as const;

export type QrServer = ReturnType<typeof fakeServer>;

/** The pilot café's server with Lan (PIN 4826) and the branch's account set, or `account`. */
export function qrCafeServer(account: unknown = SHOP_ACCOUNT): QrServer {
  const { config } = tillBootstrapWire();
  const snapshot = tillBootstrap({
    staff: [LAN],
    config: { ...config, settings: { payment_account: account } },
  });
  const server = fakeServer(snapshot);
  server.state.pins.set(LAN.id, "4826");
  return server;
}

export const money = (amount: number) => formatVnd(vnd(amount));
export const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
export const pushedOf = (server: QrServer, type: string) =>
  server.state.pushed.filter((command) => command.type === type);
export const qrPhaseShown = () =>
  document.querySelector("[data-qr-phase]")?.getAttribute("data-qr-phase");

/** The QR the till registered last, as the server holds it. */
export function lastIntentRow(server: QrServer) {
  const intents = [...server.rows.values()].filter((row) => "contentCode" in row);
  const row = intents.at(-1);
  if (row === undefined) throw new Error("the till registered no QR");
  return row;
}

/** The bank's notice as the change feed brings it: the last QR is now `status`. */
export function bankSettles(server: QrServer, status: string, receivedAmount: number | null) {
  const row = lastIntentRow(server);
  const next = { ...row, status, receivedAmount, version: row.version + 1 };
  server.rows.set(row.id, next);
  server.state.feed.push({ entity: PAYMENT_INTENT_ENTITY, entityId: row.id, snapshot: next });
  return next;
}

/**
 * Two coffees (58.000đ) rung up, then a QR for them, registered with the server; by default
 * also waits for the QR to show as waiting for the transfer.
 */
export async function twoCoffeesOnQr(server: QrServer, untilPhase: string | null = "waiting") {
  tap(/^Cà phê sữa/);
  tap(text.sale.more("Cà phê sữa"));
  tap(/^Thêm vào đơn/);
  await screen.findByText(text.sale.orderNumber(1));
  tap(text.sale.checkout);
  await screen.findByRole("heading", { name: text.checkout.payment.title });
  tap(text.qr.offer(money(58_000)));
  await screen.findByRole("heading", { name: text.qr.title });
  await waitFor(() => expect(pushedOf(server, "payment.create_intent")).toHaveLength(1));
  if (untilPhase !== null) await waitFor(() => expect(qrPhaseShown()).toBe(untilPhase));
  const created = pushedOf(server, "payment.create_intent")[0]?.payload;
  return { id: String(created?.intentId) };
}
