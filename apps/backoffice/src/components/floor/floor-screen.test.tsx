import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { vi } from "../../messages/vi";
import { BRANCHES, refused } from "../../test-support/fake-backoffice-api";
import { TABLE_1, TERRACE, fakeFloor } from "../../test-support/fake-floor";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { FloorScreen } from "./floor-screen";

const T = vi.floor;
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const row = (id: string) => document.querySelector<HTMLElement>(`li[data-table-id="${id}"]`)!;
const areaCard = (id: string) => document.querySelector<HTMLElement>(`section[data-area-id="${id}"]`)!;

async function openFloor(floor = fakeFloor(), more = {}) {
  await renderSignedIn(<FloorScreen />, { ...floor.api, ...more });
  await screen.findByRole("heading", { name: T.area(TERRACE.name) });
  return floor;
}

describe("the floor plan of a branch", () => {
  it("adds an area with a new id, last in the list, and shows it", async () => {
    const floor = await openFloor();
    fireEvent.change(screen.getByLabelText(T.newAreaLabel), { target: { value: "  Tầng 2  " } });
    fireEvent.click(screen.getByRole("button", { name: T.addArea }));
    await screen.findByRole("heading", { name: T.area("Tầng 2") });
    const [id, body] = floor.putArea.mock.calls[0]!;
    expect(id).toMatch(UUID_V7);
    expect(body).toEqual({ version: null, branchId: BRANCHES[0]!.id, name: "Tầng 2", sortOrder: 20 });
  });

  it("saves a table's name and seats on the version it read, keeping where it stands", async () => {
    const floor = await openFloor();
    const table = row(TABLE_1.id);
    fireEvent.change(within(table).getByLabelText(T.tableName), { target: { value: "Bàn VIP" } });
    fireEvent.change(within(table).getByLabelText(T.seats), { target: { value: "6" } });
    fireEvent.click(within(table).getByRole("button", { name: T.saveTable(TABLE_1.name) }));
    await within(row(TABLE_1.id)).findByText(vi.common.saved);
    expect(floor.putTable).toHaveBeenCalledWith(TABLE_1.id, {
      version: 5,
      areaId: TERRACE.id,
      name: "Bàn VIP",
      x: 2_400,
      y: 1_200,
      width: 800,
      height: 600,
      shape: "circle",
      seats: 6,
      sortOrder: 10,
    });
  });

  it("refuses seats outside 1 to 99 and an empty name without sending them", async () => {
    const floor = await openFloor();
    const table = row(TABLE_1.id);
    fireEvent.change(within(table).getByLabelText(T.tableName), { target: { value: "   " } });
    fireEvent.change(within(table).getByLabelText(T.seats), { target: { value: "0" } });
    fireEvent.click(within(table).getByRole("button", { name: T.saveTable(TABLE_1.name) }));
    expect(await within(table).findByText(T.seatsInvalid)).toBeTruthy();
    expect(within(table).getByText(T.nameInvalid(40))).toBeTruthy();
    expect(floor.putTable).not.toHaveBeenCalled();
  });

  it("adds a table to an area in the next free place of the plan", async () => {
    const floor = await openFloor();
    const card = areaCard(TERRACE.id);
    fireEvent.change(within(card).getByLabelText(T.newTableName), { target: { value: "Bàn 2" } });
    fireEvent.click(within(card).getByRole("button", { name: T.addTable(TERRACE.name) }));
    await waitFor(() => expect(floor.putTable).toHaveBeenCalled());
    const [id, body] = floor.putTable.mock.calls[0]!;
    expect(id).toMatch(UUID_V7);
    expect(body).toMatchObject({ version: null, areaId: TERRACE.id, name: "Bàn 2", seats: 4, x: 1_200, y: 0, sortOrder: 20 });
  });

  it("archives a table orders sat at, after a confirming tap", async () => {
    const floor = await openFloor();
    fireEvent.click(within(row(TABLE_1.id)).getByRole("button", { name: T.removeTable(TABLE_1.name) }));
    expect(floor.removeTable).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: T.removeConfirm }));
    await waitFor(() => expect(row(TABLE_1.id).textContent).toContain(T.archived));
    expect(floor.removeTable).toHaveBeenCalledWith(TABLE_1.id);
  });

  it("keeps a refused removal in that table's confirmation with the reason", async () => {
    await openFloor(fakeFloor(), { removeTable: async () => refused(409, "API_FLOOR_TABLE_HAS_OPEN_ORDER") });
    fireEvent.click(within(row(TABLE_1.id)).getByRole("button", { name: T.removeTable(TABLE_1.name) }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: T.removeConfirm }));
    const alert = await within(row(TABLE_1.id)).findByRole("alert");
    expect(alert.textContent).toBe(vi.errors.byCode.API_FLOOR_TABLE_HAS_OPEN_ORDER);
    expect(within(areaCard(TERRACE.id)).getAllByRole("alert")).toHaveLength(1);
  });

  it("explains a role without manage_settings when the plan cannot be changed", async () => {
    await openFloor(fakeFloor(), { putArea: async () => refused(403, "API_PERMISSION_DENIED") });
    fireEvent.change(within(areaCard(TERRACE.id)).getByLabelText(T.areaName), { target: { value: "Sân sau" } });
    fireEvent.click(screen.getByRole("button", { name: T.saveArea(TERRACE.name) }));
    const alert = await within(areaCard(TERRACE.id)).findByRole("alert");
    expect(alert.textContent).toBe(vi.errors.byCode.API_PERMISSION_DENIED);
  });
});
