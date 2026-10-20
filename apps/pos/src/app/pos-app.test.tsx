import { BROWSER_STORE_ERROR_CODES, BrowserStoreError } from "@fnb/sync-client/browser";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi as text } from "../messages/vi";
import {
  CREDENTIAL,
  draftCommand,
  fakeDependencies,
  fakeServer,
  memoryCredentials,
  refusal,
} from "../test-support/fake-pos-server";
import { tillBootstrap } from "../test-support/till-fixtures";
import { PosApp } from "./pos-app";

const LAN = { id: "0199f000-0000-7000-8000-0000000051a1", displayName: "Lan", active: true };
const SNAPSHOT = tillBootstrap({ staff: [LAN] });

function serverWithLan() {
  const server = fakeServer(SNAPSHOT);
  server.state.pins.set(LAN.id, "4826");
  return server;
}

/** A paired till with Lan signed in, on the sales screen after a first sync pass. */
async function signedInTill(server: ReturnType<typeof fakeServer>) {
  const deps = fakeDependencies(server, { credentials: memoryCredentials(CREDENTIAL).store });
  render(<PosApp deps={deps} />);
  fireEvent.click(await screen.findByRole("button", { name: LAN.displayName }));
  await typePin("4826");
  await screen.findByText(text.sync.online);
  return deps;
}

async function typePin(pin: string) {
  for (const digit of pin) fireEvent.click(screen.getByRole("button", { name: digit }));
  fireEvent.click(screen.getByRole("button", { name: text.staff.submit }));
}

describe("the POS from first start to the sales screen", () => {
  it("pairs a new till, keeps its credential, and signs the cashier in with the right PIN", async () => {
    const server = serverWithLan();
    const credentials = memoryCredentials();
    render(<PosApp deps={fakeDependencies(server, { credentials: credentials.store })} />);

    fireEvent.change(await screen.findByLabelText(text.pairing.codeLabel), {
      target: { value: "abcd-efgh" },
    });
    fireEvent.click(screen.getByRole("button", { name: text.pairing.submit }));
    fireEvent.click(await screen.findByRole("button", { name: LAN.displayName }));
    expect(server.state.calls.pair).toEqual([
      { code: "ABCDEFGH", deviceName: text.pairing.deviceNameDefault },
    ]);
    expect(credentials.saved()).toEqual(CREDENTIAL);

    await typePin("1111");
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      text.errors.API_STAFF_PIN_INVALID,
    );
    await typePin("4826");
    expect(await screen.findByText(text.sales.signedInAs(LAN.displayName))).toBeTruthy();
    expect(server.state.calls.signIn.map((call) => call.pin)).toEqual(["1111", "4826"]);
    // Online is what a sync pass that got through says, not an assumption.
    await screen.findByText(text.sync.online);
    expect(server.state.calls.pulls).toBeGreaterThan(0);
  });

  it("goes straight to the staff list on a till paired before, without asking for a code", async () => {
    const server = serverWithLan();
    const deps = fakeDependencies(server, { credentials: memoryCredentials(CREDENTIAL).store });
    render(<PosApp deps={deps} />);
    expect(await screen.findByRole("button", { name: LAN.displayName })).toBeTruthy();
    expect(screen.queryByLabelText(text.pairing.codeLabel)).toBeNull();
    expect(server.state.calls.pair).toEqual([]);
  });

  it("shows the badges from the sync passes: offline while nothing answers, though the browser says online", async () => {
    const server = serverWithLan();
    const deps = await signedInTill(server);
    expect(screen.getByText(text.sync.allSynced)).toBeTruthy();

    server.state.online = false;
    await (await deps.store).enqueue(draftCommand());
    expect(navigator.onLine).toBe(true);
    expect(await screen.findByText(text.sync.offline, {}, { timeout: 3_000 })).toBeTruthy();
    expect(await screen.findByText(text.sync.pending(1), {}, { timeout: 3_000 })).toBeTruthy();

    server.state.online = true;
    expect(await screen.findByText(text.sync.allSynced, {}, { timeout: 5_000 })).toBeTruthy();
    expect(screen.getByText(text.sync.online)).toBeTruthy();
    expect(server.state.calls.pushedCommands).toBe(1);
  });

  it("links to the commands the server refused, and lists them there", async () => {
    const server = serverWithLan();
    const deps = await signedInTill(server);
    expect(screen.queryByText(text.sync.needsAttention(1))).toBeNull();

    server.state.refuseCommandsWith = "DOMAIN_ORDER_ALREADY_PAID";
    const command = draftCommand();
    await (await deps.store).enqueue(command);
    fireEvent.click(await screen.findByText(text.sync.needsAttention(1), {}, { timeout: 3_000 }));
    expect(
      await screen.findByText(
        text.needsAttention.commandLine(command.type, "DOMAIN_ORDER_ALREADY_PAID"),
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: text.needsAttention.back }));
    expect(await screen.findByText(text.sync.needsAttention(1))).toBeTruthy();
  });
});

describe("a till that cannot sell from this tab", () => {
  it("says the POS is open in another tab when the till's database is held there", async () => {
    const store = Promise.reject(new BrowserStoreError(BROWSER_STORE_ERROR_CODES.openInAnotherTab));
    store.catch(() => {});
    render(<PosApp deps={fakeDependencies(serverWithLan(), { store })} />);
    expect(await screen.findByRole("heading", { name: text.boot.openInAnotherTab })).toBeTruthy();
    expect(screen.queryByLabelText(text.pairing.codeLabel)).toBeNull();
  });

  it("says the data could not be opened, not 'another tab', when opening failed otherwise", async () => {
    const store = Promise.reject(new Error("disk I/O error"));
    store.catch(() => {});
    render(<PosApp deps={fakeDependencies(serverWithLan(), { store })} />);
    expect(await screen.findByRole("heading", { name: text.boot.failed })).toBeTruthy();
    expect(screen.queryByText(text.boot.openInAnotherTab)).toBeNull();
  });
});

describe("loading the shop's data", () => {
  it("shows why the shop's data did not load and loads it again on retry", async () => {
    const server = serverWithLan();
    server.state.bootstrapFailure = refusal(401, "API_DEVICE_UNAUTHENTICATED");
    render(
      <PosApp
        deps={fakeDependencies(server, { credentials: memoryCredentials(CREDENTIAL).store })}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      text.errors.API_DEVICE_UNAUTHENTICATED,
    );
    expect(screen.queryByRole("button", { name: LAN.displayName })).toBeNull();

    server.state.bootstrapFailure = null;
    fireEvent.click(screen.getByRole("button", { name: text.bootstrap.retry }));
    expect(await screen.findByRole("button", { name: LAN.displayName })).toBeTruthy();
    await waitFor(() => expect(server.state.calls.bootstrap).toBe(2));
  });
});
