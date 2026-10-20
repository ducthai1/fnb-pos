import { formatVnd, vnd } from "@fnb/domain";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { simulatedPrinterThatPrints } from "../features/printing/printer-port";
import { vi as text } from "../messages/vi";
import { CREDENTIAL, fakeDependencies, memoryCredentials } from "../test-support/fake-pos-server";
import { cafeServer, signedInTill } from "../test-support/signed-in-till";

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const T = text.checkout;
const typesPushed = (server: ReturnType<typeof cafeServer>) =>
  server.state.pushed.map((command) => command.type);

async function sellTwoCoffees(server: ReturnType<typeof cafeServer>) {
  tap(/^Cà phê sữa/);
  tap(text.sale.more("Cà phê sữa"));
  tap(/^Thêm vào đơn/);
  await screen.findByText(text.sale.orderNumber(1));
  tap(text.sale.checkout);
  await screen.findByRole("heading", { name: T.payment.title });
  tap(T.payment.quickCash(formatVnd(vnd(100_000))));
  tap(T.payment.finish);
  await screen.findByRole("heading", { name: T.done.title });
  await waitFor(() => expect(typesPushed(server)).toContain("order.pay"));
}

describe("taking the money at the counter", () => {
  it("records the payment into the open shift with the domain's amount due, and shows the change", async () => {
    const server = cafeServer();
    await signedInTill(server);
    await sellTwoCoffees(server);
    const shift = server.state.pushed.find((command) => command.type === "shift.open")?.payload;
    const pay = server.state.pushed.find((command) => command.type === "order.pay")?.payload;
    expect(pay).toEqual({
      orderId: expect.any(String),
      payments: [{ method: "cash", amount: 58_000 }],
      expectedAmountDue: 58_000,
      shiftId: shift?.shiftId,
    });
    // The draft saved right before the payment is the one the server prices.
    const types = typesPushed(server);
    expect(types.lastIndexOf("order.save_draft")).toBe(types.indexOf("order.pay") - 1);
    const change = document.querySelector("[data-change]");
    expect(change?.getAttribute("data-change")).toBe("42000");
    expect(change?.textContent).toBe(T.done.change(formatVnd(vnd(42_000))));
  });

  it("only shows the slips on a till without a printer, and sends nothing to the kitchen", async () => {
    const server = cafeServer();
    await signedInTill(server);
    await sellTwoCoffees(server);
    await waitFor(() =>
      expect(document.querySelectorAll("[data-print-status='preview_only']")).toHaveLength(3),
    );
    expect(screen.getAllByText(T.done.previewOnly)).toHaveLength(3);
    await waitFor(() => expect(server.state.calls.pulls).toBeGreaterThan(4));
    expect(typesPushed(server)).not.toContain("order.mark_sent_to_kitchen");
    expect(typesPushed(server)).not.toContain("print.job_reported");
  });

  it("starts the next order with the next number", async () => {
    const server = cafeServer();
    await signedInTill(server);
    await sellTwoCoffees(server);
    tap(T.done.nextOrder);
    expect(await screen.findByText(text.sale.orderNumber(2))).toBeTruthy();
    expect(screen.getByText(text.sale.cartEmpty)).toBeTruthy();
  });

  it("marks the bar ticket sent after the payment once a printer took it", async () => {
    const server = cafeServer();
    const deps = fakeDependencies(server, {
      credentials: memoryCredentials(CREDENTIAL).store,
      printer: simulatedPrinterThatPrints,
    });
    await signedInTill(server, { deps });
    await sellTwoCoffees(server);
    await waitFor(() =>
      expect(typesPushed(server).filter((type) => type === "print.job_reported")).toHaveLength(3),
    );
    const types = typesPushed(server);
    expect(types.indexOf("order.mark_sent_to_kitchen")).toBeGreaterThan(types.indexOf("order.pay"));
  });
});
