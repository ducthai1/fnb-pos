import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi as mock } from "vitest";
import type { Device } from "../../lib/api/devices-api";
import { formatClockTime } from "../../lib/format/format-time";
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

  it("explains a role without manage_devices instead of an empty list", async () => {
    await renderSignedIn(<DevicesScreen />, {
      listDevices: async () => refused(403, "API_PERMISSION_DENIED"),
    });
    await screen.findByRole("heading", { name: vi.shell.permissionDeniedTitle });
  });
});
