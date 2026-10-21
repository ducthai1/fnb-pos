import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { describe, expect, it } from "vitest";
import { vi } from "../../messages/vi";
import { type DataColumn, DataTable } from "./data-table";
import { EmptyState } from "./empty-state";

const T = vi.table;

interface Till {
  readonly id: string;
  readonly name: string;
  readonly sold: number;
  readonly on: boolean;
}

const TILLS: Till[] = [
  { id: "a", name: "Quầy 2", sold: 5, on: true },
  { id: "b", name: "Quầy 10", sold: 20, on: false },
  { id: "c", name: "Bếp", sold: 12, on: true },
];
const COLUMNS: DataColumn<Till>[] = [
  { key: "name", label: "Tên", cell: (till) => till.name, sortValue: (till) => till.name },
  {
    key: "sold",
    label: "Đã bán",
    numeric: true,
    cell: (till) => String(till.sold),
    sortValue: (till) => till.sold,
  },
  { key: "on", label: "Bật", cell: (till) => (till.on ? "có" : "không") },
];

function renderTable(rows: readonly Till[] = TILLS) {
  render(
    <DataTable
      label="Máy"
      rows={rows}
      rowKey={(till) => till.id}
      columns={COLUMNS}
      search={{ label: "Tìm máy", text: (till) => till.name }}
      filters={[{ key: "on", label: "Đang bật", test: (till) => till.on }]}
      actions={(till) => <button type="button">{`Mở ${till.name}`}</button>}
      empty={<EmptyState icon={Inbox}>Chưa có máy.</EmptyState>}
    />,
  );
}

const shownNames = () =>
  within(screen.getByRole("table", { name: "Máy" }))
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent);

describe("a shared table of records", () => {
  it("finds rows by a name typed without tone marks, says how many it shows, and clears", () => {
    renderTable();
    fireEvent.change(screen.getByLabelText("Tìm máy"), { target: { value: "quay" } });
    expect(shownNames()).toEqual(["Quầy 2", "Quầy 10"]);
    expect(screen.getByText(T.shown(2, 3))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: T.clearSearch }));
    expect(shownNames()).toHaveLength(3);
  });

  it("goes to the search box on /, but not while typing in another field", () => {
    renderTable();
    const box = screen.getByLabelText("Tìm máy");
    fireEvent.keyDown(document.body, { key: "/" });
    expect(document.activeElement).toBe(box);
    const other = document.createElement("input");
    document.body.append(other);
    other.focus();
    fireEvent.keyDown(other, { key: "/" });
    expect(document.activeElement).toBe(other);
    fireEvent.keyDown(document.body, { key: "/", ctrlKey: true });
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it("filters by a segment that counts its rows, and back to all", () => {
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: T.count("Đang bật", 2) }));
    expect(shownNames()).toEqual(["Quầy 2", "Bếp"]);
    const all = screen.getByRole("button", { name: T.count(T.all, 3) });
    expect(all.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(all);
    expect(shownNames()).toHaveLength(3);
  });

  it("sorts by a header up, then down, then back to the server's order, saying which", () => {
    renderTable();
    const header = screen.getByRole("button", { name: T.sortColumn("Tên") });
    fireEvent.click(header);
    expect(shownNames()).toEqual(["Bếp", "Quầy 2", "Quầy 10"]);
    expect(header.closest("th")?.getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(header);
    expect(shownNames()).toEqual(["Quầy 10", "Quầy 2", "Bếp"]);
    expect(header.closest("th")?.getAttribute("aria-sort")).toBe("descending");
    fireEvent.click(header);
    expect(shownNames()).toEqual(["Quầy 2", "Quầy 10", "Bếp"]);
    expect(header.closest("th")?.hasAttribute("aria-sort")).toBe(false);
    expect(screen.queryByRole("button", { name: T.sortColumn("Bật") })).toBeNull();
  });

  it("sorts from the select a phone shows instead of headers", () => {
    renderTable();
    fireEvent.change(screen.getByLabelText(T.sortBy), { target: { value: "sold:desc" } });
    expect(shownNames()).toEqual(["Quầy 10", "Bếp", "Quầy 2"]);
  });

  it("keeps each row's actions in its last column", () => {
    renderTable();
    const row = screen.getByText("Bếp").closest("tr")!;
    expect(within(row).getByRole("button", { name: "Mở Bếp" })).toBeTruthy();
  });

  it("tells nothing-matches apart from nothing-yet", () => {
    renderTable();
    fireEvent.change(screen.getByLabelText("Tìm máy"), { target: { value: "không có" } });
    expect(screen.getByText(T.noMatch)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Chưa có máy.")).toBeNull();
  });

  it("shows only the empty state, without tools, when there is no row at all", () => {
    renderTable([]);
    expect(screen.getByText("Chưa có máy.")).toBeTruthy();
    expect(screen.queryByLabelText("Tìm máy")).toBeNull();
    expect(screen.queryByText(T.noMatch)).toBeNull();
  });
  it("names its filters after what they sort by, or plainly as a filter", () => {
    renderTable();
    expect(screen.getByRole("group", { name: T.filter })).toBeTruthy();
    cleanup();
    render(
      <DataTable
        label="Máy"
        rows={TILLS}
        rowKey={(till) => till.id}
        columns={COLUMNS}
        filters={[{ key: "on", label: "Đang bật", test: (till) => till.on }]}
        filterLabel="Trạng thái"
        empty={<EmptyState icon={Inbox}>Chưa có máy.</EmptyState>}
      />,
    );
    const group = screen.getByRole("group", { name: "Trạng thái" });
    fireEvent.click(within(group).getByRole("button", { name: T.count("Đang bật", 2) }));
    expect(shownNames()).toEqual(["Quầy 2", "Bếp"]);
  });
});
