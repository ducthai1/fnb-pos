import { formatVnd, vnd } from "@fnb/domain";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import { counterWithManager, pushedOf, tap } from "../test-support/approval-cafe";
import { CREDENTIAL, fakeDependencies, memoryCredentials } from "../test-support/fake-pos-server";
import { signedInTill } from "../test-support/signed-in-till";

const T = text.closeShift;
const money = (amount: number) => formatVnd(vnd(amount));
const slipTexts = () =>
  [...document.querySelectorAll("[data-slip-kind] pre")].map((pre) => pre.textContent ?? "");

/** A coffee sold for exactly 29.000 in cash, then the shift counted exactly and closed. */
async function closeAfterACoffee(server: ReturnType<typeof counterWithManager>, waitMs: number) {
  const deps = fakeDependencies(server, {
    credentials: memoryCredentials(CREDENTIAL).store,
    closeWaitMs: waitMs,
  });
  await signedInTill(server, { deps });
  tap(/^Cà phê sữa/);
  tap(/^Thêm vào đơn/);
  await screen.findByText(text.sale.orderNumber(1));
  tap(text.sale.checkout);
  await screen.findByRole("heading", { name: text.checkout.payment.title });
  tap(text.checkout.payment.quickCash(money(29_000)));
  tap(text.checkout.payment.finish);
  await screen.findByRole("heading", { name: text.checkout.done.title });
  tap(text.checkout.done.nextOrder);
  await screen.findByText(text.sale.orderNumber(2));
  tap(T.open);
  await screen.findByRole("heading", { name: T.title });
  await waitFor(() =>
    expect(document.querySelector("[data-expected]")?.getAttribute("data-expected")).toBe("29000"),
  );
  for (const note of [20_000, 5_000, 2_000, 2_000]) {
    tap(text.checkout.openShift.addNote(money(note)));
  }
}

describe("the closing slip", () => {
  it("is printed from the server's closed shift once it answers, with no provisional mark", async () => {
    const server = counterWithManager();
    await closeAfterACoffee(server, 5_000);
    tap(T.confirm);
    await screen.findByRole("heading", { name: T.doneTitle });
    await waitFor(() => expect(slipTexts()).toHaveLength(1));
    expect(pushedOf(server, "shift.close")).toHaveLength(1);
    expect(slipTexts()[0]).toContain("PHIẾU CHỐT CA");
    expect(slipTexts()[0]).not.toContain("TẠM");
    // The business day reads day/month/year, as every date on the till does.
    expect(slipTexts()[0]).toMatch(new RegExp(`${T.slipDay} +\\d{2}/\\d{2}/\\d{4}`));
    expect(slipTexts()[0]).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(screen.queryByRole("button", { name: T.printOfficial })).toBeNull();
    expect(screen.queryByRole("button", { name: T.officialWaiting })).toBeNull();
  });

  it("is marked provisional without the network, then the official copy prints once the server has the shift", async () => {
    const server = counterWithManager();
    await closeAfterACoffee(server, 300);
    server.state.online = false;
    tap(T.confirm);
    await screen.findByRole("heading", { name: T.doneTitle });
    await waitFor(() => expect(slipTexts()).toHaveLength(1), { timeout: 4_000 });
    expect(slipTexts()[0]).toContain("TẠM");
    expect(slipTexts()[0]).not.toContain("PHIẾU CHỐT CA");
    expect(screen.getByText(new RegExp("chưa nhận được số của máy chủ"))).toBeTruthy();
    // Until the server answers, the official copy cannot be asked for.
    const waiting = screen.getByRole("button", { name: T.officialWaiting });
    expect((waiting as HTMLButtonElement).disabled).toBe(true);

    server.state.online = true;
    const official = await screen.findByRole(
      "button",
      { name: T.printOfficial },
      { timeout: 6_000 },
    );
    expect((official as HTMLButtonElement).disabled).toBe(false);
    tap(T.printOfficial);
    await waitFor(() => expect(slipTexts()).toHaveLength(2));
    expect(slipTexts()[1]).toContain("PHIẾU CHỐT CA");
    expect(slipTexts()[1]).not.toContain("TẠM");
    expect(screen.getByText(T.officialDone)).toBeTruthy();
  });

  it("is not printed when the server refuses the close, and says the shift stays open", async () => {
    const server = counterWithManager();
    server.state.refuseTypes.set("shift.close", "SYNC_APPROVAL_REQUIRED");
    await closeAfterACoffee(server, 5_000);
    tap(T.confirm);
    await screen.findByRole("heading", { name: T.doneTitle });
    await waitFor(() => expect(pushedOf(server, "shift.close")).toHaveLength(1));
    expect(await screen.findByText(T.serverRefused)).toBeTruthy();
    expect(slipTexts()).toEqual([]);
    expect(screen.queryByRole("button", { name: T.officialWaiting })).toBeNull();
  });
});
