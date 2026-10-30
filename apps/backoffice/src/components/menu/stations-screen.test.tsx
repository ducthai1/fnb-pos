import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import type { Station } from "../../lib/api/catalog-api";
import { vi } from "../../messages/vi";
import { BRANCHES, ok, refused } from "../../test-support/fake-backoffice-api";
import { HOSTILE_MENU } from "../../test-support/hostile-catalog";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { StationsScreen } from "./stations-screen";

const T = vi.stations;
const BRANCH = BRANCHES[0]?.id ?? "";
const station = (id: string, name: string, version = 1): Station => ({ id, branchId: BRANCH, name, version, archivedAt: null });

/** The station routes over a list in memory: a write moves the version on, a stale one is a 409. */
function stationServer(start: Station[], printed: ReadonlySet<string> = new Set()) {
  let list = [...start];
  const putStation = mock.fn(async (id: string, body: { version: number | null; branchId: string; name: string }) => {
    const stored = list.find((each) => each.id === id);
    if (stored !== undefined && stored.version !== body.version) return refused(409, "API_CATALOG_VERSION_CONFLICT");
    const saved = station(id, body.name, (stored?.version ?? 0) + 1);
    list = [...list.filter((each) => each.id !== id), saved].sort((a, b) => a.name.localeCompare(b.name));
    return ok(saved);
  });
  const deleteStation = mock.fn(async (id: string, version: number) => {
    const stored = list.find((each) => each.id === id);
    if (stored !== undefined && stored.version !== version) return refused(409, "API_CATALOG_VERSION_CONFLICT");
    // A station that printed tickets is kept out of use instead of removed.
    if (printed.has(id)) {
      list = list.map((each) => (each.id === id ? { ...each, version: each.version + 1, archivedAt: "2026-10-30T03:00:00.000Z" } : each));
      return ok("archived" as const);
    }
    list = list.filter((each) => each.id !== id);
    return ok("deleted" as const);
  });
  const resumeStation = mock.fn(async (id: string, version: number) => {
    const stored = list.find((each) => each.id === id);
    if (stored !== undefined && stored.version !== version) return refused(409, "API_CATALOG_VERSION_CONFLICT");
    list = list.map((each) => (each.id === id ? { ...each, version: each.version + 1, archivedAt: null } : each));
    return ok(true as const);
  });
  /** Someone else renames the station: the next read shows it one version on. */
  const editedByAnother = (id: string) => {
    list = list.map((each) => (each.id === id ? { ...each, name: `${each.name} (đã sửa)`, version: each.version + 1 } : each));
  };
  return { api: { listStations: mock.fn(async () => ok([...list])), putStation, deleteStation, resumeStation }, putStation, deleteStation, resumeStation, editedByAnother };
}

describe("the stations page", () => {
  it("says there are none and adds the first, refusing an empty name on its field", async () => {
    const server = stationServer([]);
    await renderSignedIn(<StationsScreen />, server.api);
    await screen.findByText(T.empty);
    fireEvent.click(screen.getByRole("button", { name: T.add }));
    await screen.findByText(vi.common.nameMissing);
    expect(server.putStation).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(T.newLabel), { target: { value: "  Bar  " } });
    fireEvent.click(screen.getByRole("button", { name: T.add }));
    await screen.findByText(T.added("Bar"));
    expect(server.putStation.mock.calls[0]?.[1]).toEqual({ version: null, branchId: BRANCH, name: "Bar" });
    expect(await screen.findByText("Bar")).toBeTruthy();
  });

  it("renames under the version it read", async () => {
    const server = stationServer([station("s1", "Bar", 3)]);
    await renderSignedIn(<StationsScreen />, server.api);
    fireEvent.click(await screen.findByRole("button", { name: T.renameLabel("Bar") }));
    fireEvent.change(screen.getByLabelText(T.nameLabel), { target: { value: "Bar pha chế" } });
    fireEvent.click(screen.getByRole("button", { name: vi.common.save }));
    await screen.findByText(T.renamed("Bar pha chế"));
    expect(server.putStation).toHaveBeenCalledWith("s1", { version: 3, branchId: BRANCH, name: "Bar pha chế" });
  });

  it("reloads and says so when someone else renamed it first", async () => {
    const server = stationServer([station("s1", "Bar", 3)]);
    const stale = { ...server.api, putStation: async () => refused(409, "API_CATALOG_VERSION_CONFLICT") };
    await renderSignedIn(<StationsScreen />, stale);
    fireEvent.click(await screen.findByRole("button", { name: T.renameLabel("Bar") }));
    fireEvent.change(screen.getByLabelText(T.nameLabel), { target: { value: "Khác" } });
    fireEvent.click(screen.getByRole("button", { name: vi.common.save }));
    await screen.findByText(T.conflict);
  });

  it("asks before deleting, then deletes an unused station", async () => {
    const server = stationServer([station("s1", "Bar"), station("s2", "Bếp")]);
    await renderSignedIn(<StationsScreen />, server.api);
    fireEvent.click(await screen.findByRole("button", { name: T.deleteLabel("Bếp") }));
    expect(server.deleteStation).not.toHaveBeenCalled();
    await screen.findByText(T.deleteTitle("Bếp"));
    fireEvent.click(screen.getByRole("button", { name: vi.common.remove }));
    await screen.findByText(T.deleted("Bếp"));
    expect(server.deleteStation).toHaveBeenCalledWith("s2", 1);
  });

  it("refuses a delete of a station someone edited meanwhile, says so, and reads the list again", async () => {
    const server = stationServer([station("s1", "Bar")]);
    await renderSignedIn(<StationsScreen />, server.api);
    fireEvent.click(await screen.findByRole("button", { name: T.deleteLabel("Bar") }));
    await screen.findByText(T.deleteTitle("Bar"));
    server.editedByAnother("s1");
    fireEvent.click(screen.getByRole("button", { name: vi.common.remove }));
    await screen.findByText(T.conflict);
    expect(server.deleteStation).toHaveBeenCalledWith("s1", 1);
    // The list now shows their version, and a delete of it names that version.
    fireEvent.click(await screen.findByRole("button", { name: T.deleteLabel("Bar (đã sửa)") }));
    await screen.findByText(T.deleteTitle("Bar (đã sửa)"));
    fireEvent.click(screen.getByRole("button", { name: vi.common.remove }));
    await screen.findByText(T.deleted("Bar (đã sửa)"));
    expect(server.deleteStation).toHaveBeenLastCalledWith("s1", 2);
  });

  it("archives a station that printed tickets: says so, moves it to the archived list, and offers to use it again", async () => {
    const server = stationServer([station("s1", "Bar"), station("s2", "Bếp cũ")], new Set(["s2"]));
    await renderSignedIn(<StationsScreen />, server.api);
    fireEvent.click(await screen.findByRole("button", { name: T.deleteLabel("Bếp cũ") }));
    await screen.findByText(T.deleteTitle("Bếp cũ"));
    fireEvent.click(screen.getByRole("button", { name: vi.common.remove }));
    await screen.findByText(T.archivedDone("Bếp cũ"));
    // Out of the working list, into the archived one, which is a section of its own.
    const archived = await screen.findByRole("list", { name: T.archivedTitle(1) });
    expect(within(archived).getByText("Bếp cũ")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: T.title })).queryByText("Bếp cũ")).toBeNull();
    expect(screen.queryByRole("button", { name: T.deleteLabel("Bếp cũ") })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: T.resumeLabel("Bếp cũ") }));
    await screen.findByText(T.resumed("Bếp cũ"));
    expect(server.resumeStation).toHaveBeenCalledWith("s2", 2);
    expect(screen.queryByRole("list", { name: T.archivedTitle(1) })).toBeNull();
    expect(within(screen.getByRole("list", { name: T.title })).getByText("Bếp cũ")).toBeTruthy();
  });

  it("explains why a station still in use stays, and keeps it listed", async () => {
    const server = stationServer([station("s1", "Bar")]);
    await renderSignedIn(<StationsScreen />, { ...server.api, deleteStation: async () => refused(409, "API_CATALOG_IN_USE") });
    fireEvent.click(await screen.findByRole("button", { name: T.deleteLabel("Bar") }));
    await screen.findByText(T.deleteTitle("Bar"));
    fireEvent.click(screen.getByRole("button", { name: vi.common.remove }));
    await screen.findByText(T.inUse);
    expect(screen.getAllByText("Bar").length).toBeGreaterThan(0);
  });

  it("shows 60 stations with hostile names without breaking the rows", async () => {
    const many = Array.from({ length: 60 }, (_, at) => station(`s${at}`, at % 2 === 0 ? `${HOSTILE_MENU.productName}${at}` : `${HOSTILE_MENU.emoji} ${at}`));
    await renderSignedIn(<StationsScreen />, stationServer(many).api);
    await screen.findAllByRole("button", { name: /^Đổi tên / });
    expect(within(screen.getByRole("list", { name: T.title })).getAllByRole("listitem")).toHaveLength(60);
  });

  it("shows a failed load with a retry", async () => {
    await renderSignedIn(<StationsScreen />, { listStations: async () => refused(null) });
    await screen.findByText(vi.errors.network);
  });
});
