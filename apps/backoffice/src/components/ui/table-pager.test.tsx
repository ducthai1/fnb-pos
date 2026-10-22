import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { afterEach, describe, expect, it } from "vitest";
import { vi } from "../../messages/vi";
import { type DataColumn, DataTable } from "./data-table";
import { EmptyState } from "./empty-state";
import { pageCount, pageOf } from "./table-pager";

const T = vi.table;

interface Item {
  readonly id: string;
  readonly name: string;
}

const items = (count: number): Item[] =>
  Array.from({ length: count }, (_, at) => ({ id: `i${at + 1}`, name: `Món ${String(at + 1).padStart(3, "0")}` }));
const COLUMNS: DataColumn<Item>[] = [{ key: "name", label: "Món", cell: (item) => item.name }];

function renderList(count: number) {
  render(
    <DataTable
      label="Thực đơn"
      rows={items(count)}
      rowKey={(item) => item.id}
      columns={COLUMNS}
      search={{ label: "Tìm món", text: (item) => item.name }}
      empty={<EmptyState icon={Inbox}>Chưa có</EmptyState>}
    />,
  );
}

const shown = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((row) => row.textContent);
const pager = () => screen.getByRole("navigation", { name: T.pager });

afterEach(cleanup);

describe("long lists, a page at a time", () => {
  it("cuts the rows into pages and holds a page inside the list", () => {
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(51, 25)).toBe(3);
    expect(pageOf(items(60), 3, 25).rows.map((item) => item.id)).toEqual(items(60).slice(50).map((item) => item.id));
    expect(pageOf(items(60), 9, 25).page).toBe(3);
    expect(pageOf(items(60), 0, 25).page).toBe(1);
  });

  it("shows 25 rows first, says which of how many, and steps to the next page and back", () => {
    renderList(60);
    expect(shown()).toHaveLength(25);
    expect(shown()[0]).toBe("Món 001");
    expect(within(pager()).getByText(T.range(1, 25, 60))).toBeTruthy();
    const previous = within(pager()).getByRole("button", { name: T.previousPage }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    fireEvent.click(within(pager()).getByRole("button", { name: T.nextPage }));
    expect(shown()[0]).toBe("Món 026");
    fireEvent.click(within(pager()).getByRole("button", { name: T.nextPage }));
    expect(shown()).toHaveLength(10);
    expect(within(pager()).getByText(T.pageOf(3, 3))).toBeTruthy();
    expect((within(pager()).getByRole("button", { name: T.nextPage }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(previous);
    expect(shown()[0]).toBe("Món 026");
  });

  it("lets the person choose a bigger page, from the first page", () => {
    renderList(60);
    fireEvent.click(within(pager()).getByRole("button", { name: T.nextPage }));
    fireEvent.click(within(pager()).getByRole("combobox", { name: T.pageSize }));
    fireEvent.click(screen.getByRole("option", { name: T.pageSizeOption(50) }));
    expect(shown()).toHaveLength(50);
    expect(shown()[0]).toBe("Món 001");
  });

  it("starts again from the first page on a new search", () => {
    renderList(60);
    fireEvent.click(within(pager()).getByRole("button", { name: T.nextPage }));
    fireEvent.change(screen.getByLabelText("Tìm món"), { target: { value: "Món 0" } });
    expect(shown()[0]).toBe("Món 001");
  });

  it("has no pager on a list that fits one page", () => {
    renderList(25);
    expect(shown()).toHaveLength(25);
    expect(screen.queryByRole("navigation", { name: T.pager })).toBeNull();
  });
});
