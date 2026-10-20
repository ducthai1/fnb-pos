import { vnd } from "@fnb/domain";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FloorTableView } from "../../features/floor/floor-tables-view";
import { TableTile } from "./table-tile";

const NOW = Date.parse("2026-10-21T12:00:00.000Z");
const seatedSince = (minutes: number): FloorTableView => ({
  id: "t1",
  areaId: "a1",
  name: "Bàn 1",
  seats: 4,
  status: "occupied",
  orderId: "o1",
  openedAt: new Date(NOW - minutes * 60_000).toISOString(),
  amountDue: vnd(120_000),
  layout: null,
});

const longSeated = (minutes: number) => {
  const { container } = render(
    <TableTile table={seatedSince(minutes)} now={NOW} onOpen={() => {}} />,
  );
  return container.querySelector("[data-long-seated]")?.getAttribute("data-long-seated");
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("a table's time sat", () => {
  it("is marked for a waiter from two hours on, not before", () => {
    expect(longSeated(119)).toBe("false");
    expect(longSeated(120)).toBe("true");
  });
});
