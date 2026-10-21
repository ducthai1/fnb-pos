import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import type { Role } from "../../lib/api/roles-api";
import { vi } from "../../messages/vi";
import { ok } from "../../test-support/fake-backoffice-api";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { RolesScreen } from "./roles-screen";

const K = vi.staffTools;
const NIGHT: Role = {
  id: "0190a000-0000-7000-8000-0000000000c5",
  name: "Ca đêm",
  permissionKeys: ["open_drawer"],
  thresholds: {},
  isTemplate: false,
  archivedAt: null,
  version: 1,
};
const OLD: Role = { ...NIGHT, id: "0190a000-0000-7000-8000-0000000000c6", name: "Ca sáng cũ", archivedAt: "2026-10-01T00:00:00.000Z" };
const HELD = {
  ok: false as const,
  status: 409,
  code: "API_ROLE_IN_USE",
  body: {
    code: "API_ROLE_IN_USE",
    staff: [{ id: "0190a000-0000-7000-8000-0000000000a1", displayName: "Lan", active: false }],
    members: [{ id: "0190a000-0000-7000-8000-0000000000b1", displayName: "Chị Mai", status: "suspended" }],
  },
};

async function openArchive(archiveRole: (id: string) => Promise<unknown>) {
  const listRoles = mock.fn(async () => ok([NIGHT, OLD]));
  await renderSignedIn(<RolesScreen />, { listRoles, archiveRole: archiveRole as never });
  fireEvent.click(await screen.findByRole("button", { name: K.archiveLabel("Ca đêm") }));
  return { listRoles, panel: screen.getByRole("alertdialog", { name: K.archiveTitle("Ca đêm") }) };
}

describe("archiving a role", () => {
  it("archives after a confirming tap and reads the list again", async () => {
    const archiveRole = mock.fn(async () => ok({ ...NIGHT, archivedAt: "2026-10-20T04:00:00.000Z" }));
    const { panel, listRoles } = await openArchive(archiveRole);
    expect(archiveRole).not.toHaveBeenCalled();
    fireEvent.click(within(panel).getByRole("button", { name: K.archive }));
    await screen.findByText(K.archived("Ca đêm"));
    expect(archiveRole).toHaveBeenCalledWith(NIGHT.id);
    expect(listRoles).toHaveBeenCalledTimes(2);
  });

  it("names everyone who still holds it when the server refuses", async () => {
    const { panel } = await openArchive(async () => HELD);
    fireEvent.click(within(panel).getByRole("button", { name: K.archive }));
    const alert = await within(panel).findByRole("alert");
    expect(alert.textContent).toContain(K.holdersTitle);
    expect(alert.textContent).toContain(K.staffHolder("Lan", false));
    expect(alert.textContent).toContain(K.memberHolder("Chị Mai", "suspended"));
    expect(screen.queryByText(K.archived("Ca đêm"))).toBeNull();
  });

  it("marks an archived role and offers nothing to do with it", async () => {
    await openArchive(async () => HELD);
    const old = screen.getByText("Ca sáng cũ").closest("tr") as HTMLElement;
    expect(old.textContent).toContain(K.archivedBadge);
    expect(within(old).queryByRole("button")).toBeNull();
  });
  it("lists archived roles apart under a filter named for the status", async () => {
    await openArchive(async () => HELD);
    const filter = screen.getByRole("group", { name: vi.roles.filterLabel });
    fireEvent.click(within(filter).getByRole("button", { name: vi.table.count(vi.roles.filters.archived, 1) }));
    expect(screen.getByText("Ca sáng cũ")).toBeTruthy();
    expect(screen.queryByText("Ca đêm")).toBeNull();
  });
});
