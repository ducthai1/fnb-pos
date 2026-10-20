import { describe, expect, it } from "vitest";
import { tableView } from "./table-view";

interface Row {
  readonly name: string;
  readonly count: number | null;
  readonly active: boolean;
}

const ROWS: Row[] = [
  { name: "Trà sữa", count: 10, active: true },
  { name: "Bàn 10", count: 2, active: false },
  { name: "bàn 9", count: null, active: true },
  { name: "Ăn vặt", count: 2, active: true },
];
const names = (rows: Row[]) => rows.map((row) => row.name);

describe("the rows a table shows", () => {
  it("keeps the server's order when nothing is asked", () => {
    expect(names(tableView(ROWS, {}))).toEqual(names(ROWS));
  });

  it("finds a name typed without tone marks, and nothing typed finds all", () => {
    const searchText = (row: Row) => row.name;
    expect(names(tableView(ROWS, { typed: "tra sua", searchText }))).toEqual(["Trà sữa"]);
    expect(names(tableView(ROWS, { typed: "BAN", searchText }))).toEqual(["Bàn 10", "bàn 9"]);
    expect(tableView(ROWS, { typed: "  ", searchText })).toHaveLength(4);
    expect(tableView(ROWS, { typed: "không có", searchText })).toEqual([]);
  });

  it("filters before it searches", () => {
    const rows = tableView(ROWS, {
      keep: (row) => row.active,
      typed: "ban",
      searchText: (row) => row.name,
    });
    expect(names(rows)).toEqual(["bàn 9"]);
  });

  it("sorts words the Vietnamese way with numbers in them by size, either direction", () => {
    const sortValue = (row: Row) => row.name;
    expect(names(tableView(ROWS, { sortValue }))).toEqual(["Ăn vặt", "bàn 9", "Bàn 10", "Trà sữa"]);
    expect(names(tableView(ROWS, { sortValue, direction: "desc" }))).toEqual([
      "Trà sữa",
      "Bàn 10",
      "bàn 9",
      "Ăn vặt",
    ]);
  });

  it("sorts numbers by size, keeps ties in the server's order and rows without a value last", () => {
    const sortValue = (row: Row) => row.count;
    expect(names(tableView(ROWS, { sortValue }))).toEqual(["Bàn 10", "Ăn vặt", "Trà sữa", "bàn 9"]);
    expect(names(tableView(ROWS, { sortValue, direction: "desc" }))).toEqual([
      "Trà sữa",
      "Bàn 10",
      "Ăn vặt",
      "bàn 9",
    ]);
  });
});
