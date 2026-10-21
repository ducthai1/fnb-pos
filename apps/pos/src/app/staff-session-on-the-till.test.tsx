import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { formatVnd, vnd } from "@fnb/domain";
import { describe, expect, it } from "vitest";
import { connectionAfter } from "../features/sync/till-sync-status";
import { messageForCode, vi as text } from "../messages/vi";
import {
  CREDENTIAL,
  fakeDependencies,
  memoryCredentials,
  memoryStore,
} from "../test-support/fake-pos-server";
import { LAN, cafeServer, signedInTill, typePin } from "../test-support/signed-in-till";
import { PosApp } from "./pos-app";

const tap = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const ringUpCoffee = () => {
  tap(/^Cà phê sữa/);
  tap(/^Thêm vào đơn/);
};

describe("who is at the till", () => {
  it("goes back to the PIN screen, saying why, once the server no longer knows the session", async () => {
    const server = cafeServer();
    await signedInTill(server);
    server.state.expiredTokens.add(`staff-${LAN.id}`);
    ringUpCoffee();
    expect(
      await screen.findByRole("heading", { name: text.staff.title }, { timeout: 3_000 }),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(text.errors.API_STAFF_SESSION_INVALID);
    expect(screen.queryByText(text.sync.serverError)).toBeNull();
    // Signing in again starts a session the server knows, and the draft goes out with it.
    server.state.expiredTokens.clear();
    tap(LAN.displayName);
    await typePin("4826");
    await screen.findByRole("region", { name: text.sale.menuLabel });
    await waitFor(() =>
      expect(server.state.pushed.some((command) => command.type === "order.save_draft")).toBe(true),
    );
  });

  it("signs the cashier out on purpose and says so to whoever comes next", async () => {
    const server = cafeServer();
    await signedInTill(server);
    tap(text.session.signOut);
    expect(await screen.findByRole("heading", { name: text.staff.title })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe(text.session.signedOut(LAN.displayName));
  });

  it("switches staff without a word: someone chose to", async () => {
    const server = cafeServer();
    await signedInTill(server);
    tap(text.sales.switchStaff);
    expect(await screen.findByRole("heading", { name: text.staff.title })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("what the till says about the server refusing it for a reason of its own", () => {
  it("names a till clock running ahead as handled, with the fix the shop should still make", () => {
    expect(messageForCode("SYNC_DEVICE_CLOCK_AHEAD")).toBe(
      "Giờ máy nhanh hơn máy chủ — máy đã tự dùng giờ máy chủ và gửi lại. Nên chỉnh lại giờ Windows.",
    );
    expect(messageForCode("API_ORIGIN_NOT_ALLOWED")).not.toBe(text.errors.unknown);
  });

  it("tells a refused page address apart from a server in trouble", () => {
    const report = (failure: object) => ({
      accepted: [],
      rejected: [],
      retried: 0,
      pulled: 0,
      caughtUp: false,
      pending: 1,
      restore: null,
      failure: failure as never,
    });
    expect(connectionAfter(report({ stage: "push", kind: "http", status: 403 }))).toBe(
      "origin_refused",
    );
    expect(connectionAfter(report({ stage: "push", kind: "http", status: 500 }))).toBe(
      "server_error",
    );
    expect(connectionAfter(report({ stage: "pull", kind: "http", status: 403 }))).toBe(
      "server_error",
    );
  });
});

describe("a draft left on the counter", () => {
  it("is opened again from the day's history after the page was reloaded", async () => {
    const server = cafeServer();
    const store = memoryStore();
    const credentials = memoryCredentials(CREDENTIAL).store;
    const deps = fakeDependencies(server, { store: Promise.resolve(store), credentials });
    await signedInTill(server, { deps });
    ringUpCoffee();
    await waitFor(() =>
      expect(server.state.pushed.some((command) => command.type === "order.save_draft")).toBe(true),
    );
    const draft = server.state.pushed.find((command) => command.type === "order.save_draft");
    // The page reloads: a new app on the same database, the shift still open.
    cleanup();
    render(
      <PosApp deps={fakeDependencies(server, { store: Promise.resolve(store), credentials })} />,
    );
    tap(
      await screen.findByRole("button", { name: LAN.displayName }).then((b) => b.textContent ?? ""),
    );
    await typePin("4826");
    await screen.findByText(text.sale.orderNumber(2));
    tap(text.history.open);
    tap(
      await screen
        .findByRole("button", { name: text.history.reopen(1) })
        .then((b) => b.textContent ?? ""),
    );
    await screen.findByText(text.sale.orderNumber(1));
    tap(text.sale.checkout);
    await screen.findByRole("heading", { name: text.checkout.payment.title });
    tap(text.checkout.payment.quickCash(formatVnd(vnd(29_000))));
    tap(text.checkout.payment.finish);
    await waitFor(() =>
      expect(
        server.state.pushed.find((command) => command.type === "order.pay")?.payload,
      ).toMatchObject({
        orderId: (draft?.payload as { orderId: string }).orderId,
      }),
    );
  });
});
