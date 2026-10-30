import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import {
  bankSettles,
  pushedOf,
  qrCafeServer,
  qrPhaseShown,
  tap,
  twoCoffeesOnQr,
} from "../test-support/qr-cafe-server";
import { signedInTill } from "../test-support/signed-in-till";

const Q = text.qr;
const SHEET = Q.leaveWhileOffline;

const connection = () =>
  document.querySelector("[data-connection]")?.getAttribute("data-connection");

/** The till shows a QR, then the link to the server drops, as when the cashier's wifi goes. */
async function qrShownThenOffline() {
  const server = qrCafeServer();
  await signedInTill(server);
  await twoCoffeesOnQr(server);
  server.state.online = false;
  await waitFor(() => expect(connection()).toBe("offline"));
  return server;
}

describe("taking a QR down for cash while the till cannot hear the bank", () => {
  it("warns that the guest may have transferred, and stays on the QR when the cashier backs off", async () => {
    const server = await qrShownThenOffline();
    tap(Q.cancel);
    const sheet = await screen.findByRole("alertdialog", { name: SHEET.title });
    expect(sheet.textContent).toContain("app ngân hàng");
    tap(SHEET.stay);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    // Still waiting for the transfer, nothing taken down.
    expect(qrPhaseShown()).toBe("waiting");
    expect(pushedOf(server, "payment.cancel_intent")).toEqual([]);
  });

  it("takes the QR down and goes to cash only once the cashier says the guest has not paid", async () => {
    const server = await qrShownThenOffline();
    tap(Q.cancel);
    await screen.findByRole("alertdialog", { name: SHEET.title });
    tap(SHEET.go);
    await screen.findByLabelText(text.checkout.payment.cashTyped);
    // Recorded on the till; it reaches the server when the link is back.
    server.state.online = true;
    await waitFor(() => expect(pushedOf(server, "payment.cancel_intent")).toHaveLength(1));
  });

  it("asks again when the cashier leaves by choosing the cash card instead", async () => {
    await qrShownThenOffline();
    tap(/^Tiền mặt/);
    await screen.findByRole("alertdialog", { name: SHEET.title });
    tap(SHEET.stay);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(qrPhaseShown()).toBe("waiting");
  });

  it("does not ask while the link to the server is up", async () => {
    const server = qrCafeServer();
    await signedInTill(server);
    await twoCoffeesOnQr(server);
    tap(Q.cancel);
    await screen.findByLabelText(text.checkout.payment.cashTyped);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(pushedOf(server, "payment.cancel_intent")).toHaveLength(1);
  });

  it("does not ask once the bank's notice has settled the QR, whatever the link", async () => {
    const server = qrCafeServer();
    await signedInTill(server);
    await twoCoffeesOnQr(server);
    bankSettles(server, "partial", 20_000);
    await waitFor(() => expect(qrPhaseShown()).toBe("short"));
    server.state.online = false;
    await waitFor(() => expect(connection()).toBe("offline"));
    tap(Q.otherMethod);
    await screen.findByLabelText(text.checkout.payment.cashTyped);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
