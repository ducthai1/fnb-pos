import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import type { Role } from "../../lib/api/roles-api";
import type { NewStaffMember, StaffMember } from "../../lib/api/staff-api";
import { vi } from "../../messages/vi";
import { BRANCHES, ok, refused } from "../../test-support/fake-backoffice-api";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { StaffScreen } from "./staff-screen";

const T = vi.staff;
const CASHIER: Role = {
  id: "0190a000-0000-7000-8000-0000000000c2",
  name: "Thu ngân",
  permissionKeys: [],
  thresholds: {},
  isTemplate: true,
  archivedAt: null,
  version: 1,
};

function serving(answer: (member: NewStaffMember) => ReturnType<typeof ok<{ staffId: string }>> | ReturnType<typeof refused>) {
  const staff: StaffMember[] = [];
  const createStaff = mock.fn(async (member: NewStaffMember) => {
    const result = answer(member);
    if (result.ok) staff.push({ id: "s1", displayName: member.displayName, roleId: member.roleId, active: true, branchIds: member.branchIds, lockedOutUntil: null, failedSignIns: 0, version: 1 });
    return result;
  });
  return {
    createStaff,
    listStaff: async () => ok([...staff]),
    listRoles: async () => ok([CASHIER]),
  };
}

function fill(name: string, pin: string) {
  fireEvent.change(screen.getByLabelText(T.nameLabel), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(T.roleLabel), { target: { value: CASHIER.id } });
  fireEvent.change(screen.getByLabelText(T.pinLabel), { target: { value: pin } });
  fireEvent.click(screen.getByRole("button", { name: T.submit }));
}

describe("hiring staff", () => {
  it("adds someone to the branch being looked at, and lists them with their role", async () => {
    const api = serving(() => ok({ staffId: "s1" }));
    await renderSignedIn(<StaffScreen />, api);
    await screen.findByText(T.empty);
    fill("  Lan  ", "4826");
    await screen.findByText(T.added("Lan"));
    expect(api.createStaff).toHaveBeenCalledWith({
      displayName: "Lan",
      roleId: CASHIER.id,
      pin: "4826",
      branchIds: [BRANCHES[0]!.id],
    });
    const table = await screen.findByRole("table", { name: T.title });
    expect(table.textContent).toContain("Thu ngân");
    expect(table.textContent).toContain("Q1");
  });

  it("shows the server's weak-PIN refusal at the PIN field", async () => {
    const api = serving(() => refused(400, "API_STAFF_PIN_TOO_WEAK"));
    await renderSignedIn(<StaffScreen />, api);
    await screen.findByText(T.empty);
    fill("Lan", "1234");
    const pin = screen.getByLabelText(T.pinLabel);
    await mock.waitFor(() => expect(pin.getAttribute("aria-invalid")).toBe("true"));
    expect(screen.getByRole("alert").textContent).toBe(vi.errors.byCode.API_STAFF_PIN_TOO_WEAK);
    expect(screen.getByLabelText(T.nameLabel).getAttribute("aria-invalid")).toBeNull();
  });

  it("does not send a PIN that is not 4 to 6 digits, nor a member without a branch", async () => {
    const api = serving(() => ok({ staffId: "s1" }));
    await renderSignedIn(<StaffScreen />, api);
    await screen.findByText(T.empty);
    fill("Lan", "123");
    expect(screen.getByRole("alert").textContent).toBe(T.pinFormat);
    fireEvent.click(screen.getByRole("checkbox", { name: "Q1" }));
    fill("Lan", "482691");
    expect(screen.getByRole("alert").textContent).toBe(T.branchesMissing);
    expect(api.createStaff).not.toHaveBeenCalled();
  });

  it("keeps the form when only the list cannot be read", async () => {
    await renderSignedIn(<StaffScreen />, {
      ...serving(() => ok({ staffId: "s1" })),
      listStaff: async () => refused(404),
    });
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: T.submit })).toBeTruthy();
  });
});
