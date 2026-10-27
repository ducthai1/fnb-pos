import { vnd } from "@fnb/domain";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FloorTableView } from "../../features/floor/floor-tables-view";
import { vi as text } from "../../messages/vi";
import { FloorScreen } from "./floor-screen";

const F = text.tables.floor;
const NOW = Date.parse("2026-10-21T12:00:00.000Z");
const AREAS = [
  { id: "a1", name: "Trong nhà" },
  { id: "a2", name: "Sân thượng" },
];
const seated: FloorTableView = {
  id: "t1",
  areaId: "a1",
  name: "Bàn 1",
  seats: 4,
  status: "occupied",
  orderId: "o1",
  openedAt: new Date(NOW - 15 * 60_000).toISOString(),
  amountDue: vnd(120_000),
  layout: null,
};

const showFloor = (tables: readonly FloorTableView[]) =>
  render(
    <FloorScreen
      header={null}
      areas={AREAS}
      tables={tables}
      now={NOW}
      loadError={null}
      notice={null}
      initialView="grid"
      onOpenTable={() => {}}
    />,
  );

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the floor when nothing is shown", () => {
  it("says where tables come from when an area has none", () => {
    showFloor([seated]);
    fireEvent.click(screen.getByRole("tab", { name: "Sân thượng" }));
    expect(screen.getByText(F.emptyArea)).toBeTruthy();
    expect(screen.getByText(F.emptyAreaHint)).toBeTruthy();
  });

  it("points back to every table when the filter keeps none", () => {
    showFloor([seated]);
    fireEvent.click(screen.getByRole("button", { name: F.filters.free }));
    expect(screen.getByText(F.noneShown)).toBeTruthy();
    expect(screen.getByText(F.noneShownHint)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: F.filters.all }));
    expect(screen.getByRole("button", { name: /Bàn 1/ })).toBeTruthy();
  });
});
