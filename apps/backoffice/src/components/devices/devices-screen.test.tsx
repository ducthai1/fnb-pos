import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi as mock } from "vitest";
import type { Device } from "../../lib/api/devices-api";
import { formatClockTime, formatDateTime } from "../../lib/format/format-time";
import { vi } from "../../messages/vi";
import { BRANCHES, ok, refused } from "../../test-support/fake-backoffice-api";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { DevicesScreen } from "./devices-screen";

const T = vi.devices;
const Q1 = BRANCHES[0]!.id;

let devices: Device[];
const listDevices = mock.fn(async (branchId: string) =>
  ok(devices.filter((device) => device.branchId === branchId)),
);
const revokeDevice = mock.fn(async (id: string) => {
  devices = devices.map((device) =>
    device.id === id ? { ...device, revokedAt: "2026-10-20T03:00:00.000Z" } : device,
  );
  return ok(true as const);
});

beforeEach(() => {
  devices = [
    { id: "d1", name: "Quầy 1", branchId: Q1, pairedAt: "2026-10-19T01:00:00.000Z", revokedAt: null },
    { id: "d2", name: "Quầy Q3", branchId: BRANCHES[1]!.id, pairedAt: "2026-10-19T01:00:00.000Z", revokedAt: null },
  ];
  listDevices.mockClear();
  revokeDevice.mockClear();
});

describe("the devices of a branch", () => {
  it("lists only the tills of the branch being looked at", async () => {
    await renderSignedIn(<DevicesScreen />, { listDevices, revokeDevice });
    await screen.findByText("Quầy 1");
    expect(screen.queryByText("Quầy Q3")).toBeNull();
    expect(listDevices).toHaveBeenLastCalledWith(Q1);
  });

  it("shows a new pairing code large, with the time it stops working", async () => {
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const createPairingCode = mock.fn(async (branchId: string) =>
      ok({ code: "K7M2Q9XA", branchId, expiresAt }),
    );
    await renderSignedIn(<DevicesScreen />, { listDevices, createPairingCode });
    fireEvent.click(await screen.findByRole("button", { name: T.createCode }));
    const shown = await screen.findByRole("status", { name: T.codeLabel });
    expect(shown.textContent).toBe("K7M2Q9XA");
    expect(screen.getByText(T.codeExpires(formatClockTime(expiresAt)))).toBeTruthy();
    expect(createPairingCode).toHaveBeenCalledWith(Q1);
  });

  it("says a code is over once its time has passed", async () => {
    const createPairingCode = mock.fn(async (branchId: string) =>
      ok({ code: "K7M2Q9XA", branchId, expiresAt: new Date(Date.now() - 1000).toISOString() }),
    );
    await renderSignedIn(<DevicesScreen />, { listDevices, createPairingCode });
    fireEvent.click(await screen.findByRole("button", { name: T.createCode }));
    await screen.findByText(T.codeExpired);
  });

  it("warns, before revoking, that the till still has a shift open and how it gets closed", async () => {
    const openedAt = "2026-10-20T01:15:00.000Z";
    devices = devices.map((device) => (device.id === "d1" ? { ...device, openShiftOpenedAt: openedAt } : device));
    await renderSignedIn(<DevicesScreen />, { listDevices, revokeDevice });
    fireEvent.click(await screen.findByRole("button", { name: T.revokeLabel("Quầy 1") }));
    const dialog = screen.getByRole("alertdialog", { name: T.revokeTitle("Quầy 1") });
    const warning = dialog.querySelector("[data-revoke-open-shift]");
    expect(warning?.textContent).toBe(T.revokeOpenShift(formatDateTime(openedAt)));
    // Still one confirming tap: a stolen till must be revocable at once.
    fireEvent.click(within(dialog).getByRole("button", { name: T.revokeConfirm }));
    await screen.findByText(T.revokedDone("Quầy 1"));
    expect(revokeDevice).toHaveBeenCalledWith("d1");
  });

  it("does not warn for a till with no shift open, nor for an older API that does not say", async () => {
    devices = devices.map((device) => (device.id === "d1" ? { ...device, openShiftOpenedAt: null } : device));
    await renderSignedIn(<DevicesScreen />, { listDevices, revokeDevice });
    fireEvent.click(await screen.findByRole("button", { name: T.revokeLabel("Quầy 1") }));
    expect(screen.getByRole("alertdialog").querySelector("[data-revoke-open-shift]")).toBeNull();
  });

  it("revokes a till only after the second, confirming tap", async () => {
    await renderSignedIn(<DevicesScreen />, { listDevices, revokeDevice });
    fireEvent.click(await screen.findByRole("button", { name: T.revokeLabel("Quầy 1") }));
    const dialog = screen.getByRole("alertdialog", { name: T.revokeTitle("Quầy 1") });
    expect(revokeDevice).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: vi.common.cancel }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(revokeDevice).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: T.revokeLabel("Quầy 1") }));
    fireEvent.click(screen.getByRole("button", { name: T.revokeConfirm }));
    await screen.findByText(T.revokedDone("Quầy 1"));
    expect(revokeDevice).toHaveBeenCalledWith("d1");
    // Reloaded from the API: the till is shown revoked and cannot be revoked again.
    await mock.waitFor(() =>
      expect(screen.queryByRole("button", { name: T.revokeLabel("Quầy 1") })).toBeNull(),
    );
  });

  it("keeps the confirmation open with the reason when the API refuses the revoke", async () => {
    await renderSignedIn(<DevicesScreen />, {
      listDevices,
      revokeDevice: async () => refused(404, "API_DEVICE_NOT_FOUND"),
    });
    fireEvent.click(await screen.findByRole("button", { name: T.revokeLabel("Quầy 1") }));
    fireEvent.click(screen.getByRole("button", { name: T.revokeConfirm }));
    const dialog = screen.getByRole("alertdialog");
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      vi.errors.byCode.API_DEVICE_NOT_FOUND,
    );
  });

  it("gives a revoked till a one-time code to send the rest, and offers none to a live one", async () => {
    devices[0] = { ...devices[0]!, name: "Quầy thu ngân tầng hai — chi nhánh Bình Thạnh rất dài", revokedAt: "2026-10-20T03:00:00.000Z" };
    devices.push({ id: "d3", name: "Quầy 3", branchId: Q1, pairedAt: "2026-10-19T01:00:00.000Z", revokedAt: null });
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const createFlushGrant = mock.fn(async (deviceId: string) => ok({ code: "Q7RT4M2X", deviceId, expiresAt }));
    await renderSignedIn(<DevicesScreen />, { listDevices, createFlushGrant });
    const name = devices[0]!.name;
    await screen.findByText(name);
    expect(screen.queryByRole("button", { name: T.flushGrantLabel("Quầy 3") })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: T.flushGrantLabel(name) }));
    const panel = await screen.findByRole("region", { name: T.flushTitle(name) });
    expect(within(panel).getByRole("status").textContent).toBe("Q7RT4M2X");
    expect(within(panel).getByText(T.flushExpires(formatClockTime(expiresAt)))).toBeTruthy();
    expect(createFlushGrant).toHaveBeenCalledWith("d1");
    fireEvent.click(within(panel).getByRole("button", { name: T.flushClose }));
    expect(screen.queryByRole("region", { name: T.flushTitle(name) })).toBeNull();
  });

  it("says why when the API will not give a code, and shows an expired one as over", async () => {
    devices[0] = { ...devices[0]!, revokedAt: "2026-10-20T03:00:00.000Z" };
    let answer = refused(409, "API_DEVICE_NOT_REVOKED");
    await renderSignedIn(<DevicesScreen />, { listDevices, createFlushGrant: async () => answer });
    fireEvent.click(await screen.findByRole("button", { name: T.flushGrantLabel("Quầy 1") }));
    expect(await screen.findByText(vi.errors.byCode.API_DEVICE_NOT_REVOKED ?? "")).toBeTruthy();
    answer = ok({ code: "Q7RT4M2X", deviceId: "d1", expiresAt: new Date(Date.now() - 1000).toISOString() }) as never;
    fireEvent.click(screen.getByRole("button", { name: T.flushGrantLabel("Quầy 1") }));
    expect(await screen.findByText(T.flushExpired)).toBeTruthy();
  });

  it("explains a role without manage_devices instead of an empty list", async () => {
    await renderSignedIn(<DevicesScreen />, {
      listDevices: async () => refused(403, "API_PERMISSION_DENIED"),
    });
    await screen.findByRole("heading", { name: vi.shell.permissionDeniedTitle });
  });
});
