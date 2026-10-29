import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import type { ApiResult } from "../../lib/api/api-result";
import type { Role } from "../../lib/api/roles-api";
import type { StaffMember } from "../../lib/api/staff-api";
import { vi } from "../../messages/vi";
import { BRANCHES, ok, refused } from "../../test-support/fake-backoffice-api";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { StaffScreen } from "./staff-screen";
import { openPicker } from "../../test-support/pick-from-listbox";

const K = vi.staffTools;
const role = (n: number, name: string, archivedAt: string | null = null): Role => ({
  id: `0190a000-0000-7000-8000-0000000000c${n}`,
  name,
  permissionKeys: [],
  thresholds: {},
  isTemplate: false,
  archivedAt,
  version: 1,
});
const CASHIER = role(1, "Thu ngân");
const SHIFT_LEAD = role(2, "Trưởng ca");
const OLD_ROLE = role(3, "Ca đêm cũ", "2026-10-01T00:00:00.000Z");
const LAN: StaffMember = {
  id: "0190a000-0000-7000-8000-0000000000a1",
  displayName: "Lan",
  roleId: CASHIER.id,
  active: true,
  branchIds: [BRANCHES[0]!.id],
  lockedOutUntil: null,
  failedSignIns: 0,
};

/** A staff list the fake changes as the server would, so a refresh shows what was done. */
function serving(member: StaffMember = LAN) {
  let current = member;
  const answer = <T,>(change: Partial<StaffMember>, value: T) => {
    current = { ...current, ...change };
    return ok(value);
  };
  return {
    listStaff: mock.fn(async () => ok([current])),
    listRoles: async () => ok([CASHIER, SHIFT_LEAD, OLD_ROLE]),
    updateStaff: mock.fn(async (_id: string, body: { displayName?: string; roleId?: string }) =>
      answer(body, true as const),
    ),
    deactivateStaff: mock.fn(async () => answer({ active: false }, true as const)),
    reactivateStaff: mock.fn(async () => answer({ active: true }, true as const)),
    unlockStaffPin: mock.fn(async () => answer({ lockedOutUntil: null, failedSignIns: 0 }, true as const)),
    resetStaffPin: mock.fn(async () => ok(true as const)),
  };
}

async function openTool(label: string, api = serving()) {
  await renderSignedIn(<StaffScreen />, api);
  fireEvent.click(await screen.findByRole("button", { name: label }));
  return { api, panel: screen.getByRole("alertdialog") };
}

const rowOf = (id: string) => document.querySelector<HTMLElement>(`tr[data-staff="${id}"]`)!;

describe("the staff tools", () => {
  it("renames someone and moves them to another role, offering no archived role", async () => {
    const { api, panel } = await openTool(K.editLabel("Lan"));
    expect(openPicker(panel, vi.staff.roleLabel)).toEqual(["Thu ngân", "Trưởng ca"]);
    fireEvent.change(within(panel).getByLabelText(vi.staff.nameLabel), { target: { value: " Lan Ca Tối " } });
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Trưởng ca" }));
    fireEvent.click(within(panel).getByRole("button", { name: K.save }));
    await screen.findByText(K.saved("Lan Ca Tối"));
    expect(api.updateStaff).toHaveBeenCalledWith(LAN.id, { displayName: "Lan Ca Tối", roleId: SHIFT_LEAD.id });
    await waitFor(() => expect(rowOf(LAN.id).textContent).toContain("Trưởng ca"));
  });

  it("sends nothing when nothing changed, or the name is blank", async () => {
    const { api, panel } = await openTool(K.editLabel("Lan"));
    fireEvent.click(within(panel).getByRole("button", { name: K.save }));
    expect(within(panel).getByRole("alert").textContent).toBe(K.nothingChanged);
    fireEvent.change(within(panel).getByLabelText(vi.staff.nameLabel), { target: { value: "  " } });
    fireEvent.click(within(panel).getByRole("button", { name: K.save }));
    expect(within(panel).getByText(K.nameMissing)).toBeTruthy();
    expect(api.updateStaff).not.toHaveBeenCalled();
  });

  it("locks someone after a confirming tap, keeping the row as it was until the server says so", async () => {
    let answer: (result: ApiResult<true>) => void = () => {};
    const api = { ...serving(), deactivateStaff: mock.fn(() => new Promise<ApiResult<true>>((resolve) => (answer = resolve))) };
    const { panel } = await openTool(K.lockLabel("Lan"), api);
    expect(within(panel).getByText(K.lockHint)).toBeTruthy();
    fireEvent.click(within(panel).getByRole("button", { name: K.lock }));
    expect((within(panel).getByRole("button", { name: K.locking }) as HTMLButtonElement).disabled).toBe(true);
    expect(rowOf(LAN.id).textContent).toContain(vi.staff.active);
    answer(refused(409, "API_STAFF_ALREADY_INACTIVE"));
    expect((await within(panel).findByRole("alert")).textContent).toBe(vi.errors.byCode.API_STAFF_ALREADY_INACTIVE);
    expect(rowOf(LAN.id).textContent).toContain(vi.staff.active);
  });

  it("locks and lets back in, the row following the server", async () => {
    const { api, panel } = await openTool(K.lockLabel("Lan"));
    fireEvent.click(within(panel).getByRole("button", { name: K.lock }));
    await screen.findByText(K.locked("Lan"));
    await waitFor(() => expect(rowOf(LAN.id).textContent).toContain(vi.staff.inactive));
    fireEvent.click(screen.getByRole("button", { name: K.reopenLabel("Lan") }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: K.reopen }));
    await screen.findByText(K.reopened("Lan"));
    expect(api.deactivateStaff).toHaveBeenCalledWith(LAN.id);
    expect(api.reactivateStaff).toHaveBeenCalledWith(LAN.id);
  });

  it("sets a new PIN only once it is 4 to 6 digits, and shows a weak one's refusal in place", async () => {
    const api = { ...serving(), resetStaffPin: mock.fn(async () => refused(400, "API_STAFF_PIN_TOO_WEAK")) };
    const { panel } = await openTool(K.resetPinLabel("Lan"), api);
    const field = within(panel).getByLabelText(K.newPinLabel);
    fireEvent.change(field, { target: { value: "12a" } });
    fireEvent.click(within(panel).getByRole("button", { name: K.resetPin }));
    expect(within(panel).getByText(vi.staff.pinFormat)).toBeTruthy();
    expect(api.resetStaffPin).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "1234" } });
    fireEvent.click(within(panel).getByRole("button", { name: K.resetPin }));
    expect((await within(panel).findByRole("alert")).textContent).toBe(vi.errors.byCode.API_STAFF_PIN_TOO_WEAK);
    expect(api.resetStaffPin).toHaveBeenCalledWith(LAN.id, "1234");
  });

  it("offers to unlock a PIN only for someone wrong PINs are counted against", async () => {
    await renderSignedIn(<StaffScreen />, serving());
    await screen.findByRole("button", { name: K.lockLabel("Lan") });
    expect(screen.queryByRole("button", { name: K.unlockPinLabel("Lan") })).toBeNull();
  });

  it("shows until when a PIN is locked and clears it", async () => {
    const locked = { ...LAN, lockedOutUntil: "2026-10-20T05:00:00.000Z", failedSignIns: 5 };
    const { api, panel } = await openTool(K.unlockPinLabel("Lan"), serving(locked));
    expect(rowOf(LAN.id).textContent).toContain(K.lockedOutUntil("").trim());
    fireEvent.click(within(panel).getByRole("button", { name: K.unlockPin }));
    await screen.findByText(K.pinUnlocked("Lan"));
    expect(api.unlockStaffPin).toHaveBeenCalledWith(LAN.id);
    await waitFor(() => expect(screen.queryByRole("button", { name: K.unlockPinLabel("Lan") })).toBeNull());
  });
});
