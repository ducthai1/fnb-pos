import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { DataTable } from "./data-table";

interface Drink {
  readonly id: string;
  readonly name: string;
  readonly hot: boolean;
}

const DRINKS: Drink[] = [
  { id: "a", name: "Bạc xỉu", hot: false },
  { id: "b", name: "Cà phê nóng", hot: true },
  { id: "c", name: "Trà gừng", hot: true },
];

function Picking({ onPicked }: { onPicked: (ids: string[]) => void }) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  return (
    <DataTable
      label="Đồ uống"
      rows={DRINKS}
      rowKey={(drink) => drink.id}
      columns={[{ key: "name", label: "Tên", cell: (drink) => drink.name }]}
      search={{ label: "Tìm", text: (drink) => drink.name }}
      filters={[{ key: "hot", label: "Nóng", test: (drink) => drink.hot }]}
      empty={null}
      selection={{
        picked,
        onPick: (next) => {
          setPicked(next);
          onPicked([...next].sort());
        },
        label: (drink) => `Chọn ${drink.name}`,
        allLabel: "Chọn tất cả",
      }}
    />
  );
}

describe("ticking rows of a table", () => {
  it("ticks one row by its name, and all of the rows a filter shows", () => {
    let picked: string[] = [];
    render(<Picking onPicked={(ids) => (picked = ids)} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Chọn Bạc xỉu" }));
    expect(picked).toEqual(["a"]);
    fireEvent.click(screen.getByRole("button", { name: /^Nóng/ }));
    const all = screen.getByRole("checkbox", { name: "Chọn tất cả" });
    expect(all).toHaveProperty("checked", false);
    fireEvent.click(all);
    // The row hidden by the filter stays ticked; the two shown join it.
    expect(picked).toEqual(["a", "b", "c"]);
    expect(screen.getByRole("checkbox", { name: "Chọn tất cả" })).toHaveProperty("checked", true);
    fireEvent.click(screen.getByRole("checkbox", { name: "Chọn tất cả" }));
    expect(picked).toEqual(["a"]);
  });

  it("keeps the row's first cell readable beside its box", () => {
    render(<Picking onPicked={() => {}} />);
    const box = screen.getByRole("checkbox", { name: "Chọn Trà gừng" });
    expect(box.closest("td")?.textContent).toBe("Trà gừng");
  });
});
