import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import type { Role, RoleGrantsBody } from "../../lib/api/roles-api";
import { vi } from "../../messages/vi";
import { ok, refused } from "../../test-support/fake-backoffice-api";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { RolesScreen } from "./roles-screen";

const T = vi.roles;
const OWNER_ROLE: Role = {
  id: "0190a000-0000-7000-8000-0000000000c1",
  name: "Chủ quán",
  permissionKeys: ["manage_staff", "line_discount"],
  thresholds: {},
  isTemplate: true,
  archivedAt: null,
  version: 1,
};

async function openEditor(updateRole: (id: string, version: number, body: RoleGrantsBody) => Promise<unknown>) {
  await renderSignedIn(<RolesScreen />, {
    listRoles: async () => ok([OWNER_ROLE]),
    updateRole: updateRole as never,
  });
  fireEvent.click(await screen.findByRole("button", { name: T.editLabel("Chủ quán") }));
}

describe("editing a role", () => {
  it("says so when someone changed the role first, and keeps the form", async () => {
    const updateRole = mock.fn(async () => refused(409, "API_ROLE_VERSION_CONFLICT"));
    await openEditor(updateRole);
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    expect((await screen.findByRole("alert")).textContent).toBe(vi.errors.byCode.API_ROLE_VERSION_CONFLICT);
    expect(updateRole).toHaveBeenCalledWith(OWNER_ROLE.id, OWNER_ROLE.version, expect.anything());
    expect(screen.getByRole("button", { name: T.save })).toBeTruthy();
  });

  it("saves the ticked keys with the discount cap typed next to them", async () => {
    const updateRole = mock.fn(async (_id: string, _version: number, body: RoleGrantsBody) => ok({ ...OWNER_ROLE, ...body }));
    await openEditor(updateRole);
    fireEvent.change(screen.getByLabelText(T.maxRateLabel), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("checkbox", { name: T.permissions.view_reports }));
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    await screen.findByText(T.saved("Chủ quán"));
    expect(updateRole).toHaveBeenCalledWith(OWNER_ROLE.id, OWNER_ROLE.version, {
      name: "Chủ quán",
      permissionKeys: ["line_discount", "view_reports", "manage_staff"],
      thresholds: { line_discount: { maxRate: 1500 } },
    });
  });

  it("shows why the API refused to take away the last administrator's key", async () => {
    const updateRole = mock.fn(async () => refused(409, "API_ROLE_LAST_ADMINISTRATOR"));
    await openEditor(updateRole);
    fireEvent.click(screen.getByRole("checkbox", { name: T.permissions.manage_staff }));
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      vi.errors.byCode.API_ROLE_LAST_ADMINISTRATOR,
    );
    expect(screen.queryByText(T.saved("Chủ quán"))).toBeNull();
  });

  it("does not send a cap the domain would refuse", async () => {
    const updateRole = mock.fn(async () => ok(OWNER_ROLE));
    await openEditor(updateRole);
    fireEvent.change(screen.getByLabelText(T.maxRateLabel), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: T.save }));
    expect(screen.getByRole("alert").textContent).toBe(T.rateInvalid);
    expect(updateRole).not.toHaveBeenCalled();
  });
});
