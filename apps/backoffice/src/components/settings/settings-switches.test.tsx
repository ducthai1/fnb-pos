import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ApiFailure } from "../../lib/api/api-result";
import { vi } from "../../messages/vi";
import { BRANCHES, ok, refused } from "../../test-support/fake-backoffice-api";
import { BRANCH_SCOPE, fakeSettings } from "../../test-support/fake-settings";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { SettingsScreen } from "./settings-screen";
import { pickFrom } from "../../test-support/pick-from-listbox";

const T = vi.settings;
const F = T.flags;

const switchRow = (key: string) => document.querySelector<HTMLElement>(`li[data-setting-key="${key}"]`)!;
const box = (key: string) => within(switchRow(key)).getByRole("checkbox") as HTMLInputElement;

function violation(code: string, flag: string, other: string, scopeKind: string, scopeId: string): ApiFailure {
  return { ok: false, status: 400, code, body: { code, details: { flag, other, scopeKind, scopeId } } };
}

const waitChecked = (key: string, checked = true) =>
  waitFor(() => expect(box(key).checked).toBe(checked));

async function openSettings(settings = fakeSettings(), more = {}) {
  const view = await renderSignedIn(<SettingsScreen />, { ...settings.api, ...more });
  await screen.findByRole("heading", { name: T.switchesTitle });
  return view;
}

describe("the feature switches of a branch", () => {
  it("turns a switch on at the branch and shows it as set here", async () => {
    const settings = fakeSettings();
    await openSettings(settings);
    expect(settings.getSettings).toHaveBeenLastCalledWith(BRANCH_SCOPE);
    expect(box("tables").checked).toBe(false);
    fireEvent.click(box("tables"));
    await waitChecked("tables");
    expect(settings.putSetting).toHaveBeenCalledWith(BRANCH_SCOPE, "tables", true);
    expect(within(switchRow("tables")).getByText(T.setHere)).toBeTruthy();
  });

  it("explains a refused switch under that switch, naming the one it needs", async () => {
    const settings = fakeSettings();
    await openSettings(settings, {
      putSetting: async () => violation("FLAGS_REQUIRES_MISSING", "qr_ordering", "tables", "branch", BRANCH_SCOPE.id),
    });
    fireEvent.click(box("qr_ordering"));
    const alert = await within(switchRow("qr_ordering")).findByRole("alert");
    expect(alert.textContent).toBe(T.violation.requires(F.qr_ordering!, F.tables!));
    expect(box("qr_ordering").getAttribute("aria-invalid")).toBe("true");
    expect(box("qr_ordering").checked).toBe(false);
    // Nowhere else: not under the switch it names, not as a page-wide error.
    expect(within(switchRow("tables")).queryByRole("alert")).toBeNull();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("names the branch where a brand switch clashes with what that branch set", async () => {
    const q3 = BRANCHES[1]!;
    const settings = fakeSettings();
    await openSettings(settings, {
      putSetting: async () =>
        violation("FLAGS_EXCLUDES_BOTH_ON", "auto_86_on_zero_stock", "allow_negative_stock", "branch", q3.id),
    });
    fireEvent.click(screen.getByRole("radio", { name: T.layer.brand(q3.brandName) }));
    await screen.findByRole("heading", { name: T.switchesTitle });
    fireEvent.click(box("auto_86_on_zero_stock"));
    const alert = await within(switchRow("auto_86_on_zero_stock")).findByRole("alert");
    expect(alert.textContent).toBe(
      `${T.violation.excludes(F.auto_86_on_zero_stock!, F.allow_negative_stock!)} ${T.violation.at(T.violation.place.branch(q3.name))}`,
    );
  });

  it("shows a refusal that is no rule of switches by its own sentence", async () => {
    await openSettings(fakeSettings(), { putSetting: async () => refused(400, "API_SETTINGS_LAYER_NOT_ALLOWED") });
    fireEvent.click(box("tables"));
    const alert = await within(switchRow("tables")).findByRole("alert");
    expect(alert.textContent).toBe(vi.errors.byCode.API_SETTINGS_LAYER_NOT_ALLOWED);
  });

  it("lets a switch set here go back to what the layer above says", async () => {
    const settings = fakeSettings({ [BRANCH_SCOPE.id]: { tables: true } });
    await openSettings(settings);
    expect(box("tables").checked).toBe(true);
    fireEvent.click(within(switchRow("tables")).getByRole("button", { name: T.useInherited }));
    await waitChecked("tables", false);
    expect(settings.clearSetting).toHaveBeenCalledWith(BRANCH_SCOPE, "tables");
    expect(within(switchRow("tables")).getByText(T.source.system!)).toBeTruthy();
  });

  it("locks at one till what only a whole branch may set, and keeps a till's own switch open", async () => {
    const listDevices = async (branchId: string) =>
      ok([{ id: "0190a000-0000-7000-8000-00000000d001", name: "Quầy 1", branchId, pairedAt: "2026-10-19T01:00:00.000Z", revokedAt: null }]);
    const settings = fakeSettings();
    await openSettings(settings, { listDevices });
    fireEvent.click(screen.getByRole("radio", { name: T.layer.device }));
    await screen.findByRole("combobox", { name: T.deviceLabel });
    pickFrom(document, T.deviceLabel, "Quầy 1");
    await waitFor(() => expect(settings.getSettings).toHaveBeenLastCalledWith({ kind: "device", id: "0190a000-0000-7000-8000-00000000d001" }));
    await screen.findByRole("heading", { name: T.switchesTitle });
    expect(box("tables").disabled).toBe(true);
    expect(within(switchRow("tables")).getByText(T.notEditableHere)).toBeTruthy();
    expect(box("cup_labels").disabled).toBe(false);
  });

  it("explains a role without manage_settings instead of an empty page", async () => {
    await renderSignedIn(<SettingsScreen />, { getSettings: async () => refused(403, "API_PERMISSION_DENIED") });
    await screen.findByRole("heading", { name: vi.shell.permissionDeniedTitle });
    expect(screen.queryByRole("heading", { name: T.switchesTitle })).toBeNull();
  });
});
