import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi as mock } from "vitest";
import type { Category } from "../../lib/api/catalog-api";
import { vi } from "../../messages/vi";
import { BRANCHES, ok, refused } from "../../test-support/fake-backoffice-api";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { CategoriesScreen } from "./categories-screen";

const T = vi.menu.categories;
const BRAND = BRANCHES[0]!.brandId;

/** The category routes over a list in memory: a write moves the version on. */
function categoryServer(start: Category[]) {
  let list = [...start];
  const putCategory = mock.fn(async (id: string, body: { version: number | null; brandId: string; name: string; sortOrder: number }) => {
    const stored = list.find((each) => each.id === id);
    if (stored !== undefined && stored.version !== body.version) return refused(409, "API_CATALOG_VERSION_CONFLICT");
    const saved: Category = { id, brandId: body.brandId, name: body.name, sortOrder: body.sortOrder, version: (stored?.version ?? 0) + 1 };
    list = [...list.filter((each) => each.id !== id), saved];
    return ok(saved);
  });
  return { api: { listCategories: async () => ok([...list]), putCategory }, putCategory };
}

const CATEGORIES: Category[] = [
  { id: "c2", brandId: BRAND, name: "Trà sữa", sortOrder: 20, version: 4 },
  { id: "c1", brandId: BRAND, name: "Cà phê", sortOrder: 10, version: 2 },
  { id: "c3", brandId: BRAND, name: "Bánh", sortOrder: 30, version: 1 },
];
const shownOrder = () => [...document.querySelectorAll(".bo-category-row__name")].map((name) => name.textContent);

describe("the order of the menu's categories", () => {
  it("lists them in the menu's order and moves one up by its button, on the versions read", async () => {
    const server = categoryServer(CATEGORIES);
    await renderSignedIn(<CategoriesScreen />, server.api);
    await screen.findByText("Bánh");
    expect(shownOrder()).toEqual(["Cà phê", "Trà sữa", "Bánh"]);
    fireEvent.click(screen.getByRole("button", { name: T.moveUp("Bánh") }));
    await mock.waitFor(() => expect(shownOrder()).toEqual(["Cà phê", "Bánh", "Trà sữa"]));
    expect(server.putCategory.mock.calls.map(([id, body]) => [id, body.sortOrder, body.version])).toEqual([
      ["c3", 20, 1],
      ["c2", 30, 4],
    ]);
  });

  it("offers no move past either end", async () => {
    await renderSignedIn(<CategoriesScreen />, categoryServer(CATEGORIES).api);
    await screen.findByText("Bánh");
    expect((screen.getByRole("button", { name: T.moveUp("Cà phê") }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: T.moveDown("Bánh") }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: T.moveDown("Cà phê") }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("says someone changed the category first when deleting it, and reads the list again", async () => {
    const server = categoryServer(CATEGORIES);
    const listCategories = mock.fn(server.api.listCategories);
    const sent: [string, number][] = [];
    const deleteCategory = async (id: string, version: number) => {
      sent.push([id, version]);
      return refused(409, "API_CATALOG_VERSION_CONFLICT");
    };
    await renderSignedIn(<CategoriesScreen />, { ...server.api, listCategories, deleteCategory });
    await screen.findByText("Bánh");
    fireEvent.click(screen.getByRole("button", { name: T.deleteLabel("Bánh") }));
    expect((await screen.findByRole("alert")).textContent).toBe(vi.errors.byCode.API_CATALOG_VERSION_CONFLICT);
    expect(sent).toEqual([["c3", 1]]);
    await mock.waitFor(() => expect(listCategories).toHaveBeenCalledTimes(2));
  });

  it("says why a move was refused and reads the list again", async () => {
    const server = categoryServer(CATEGORIES);
    const putCategory = mock.fn(async () => refused(409, "API_CATALOG_VERSION_CONFLICT"));
    await renderSignedIn(<CategoriesScreen />, { ...server.api, putCategory });
    await screen.findByText("Bánh");
    fireEvent.click(screen.getByRole("button", { name: T.moveDown("Cà phê") }));
    expect((await screen.findByRole("alert")).textContent).toBe(vi.errors.byCode.API_CATALOG_VERSION_CONFLICT);
    expect(putCategory).toHaveBeenCalledOnce();
    expect(shownOrder()).toEqual(["Cà phê", "Trà sữa", "Bánh"]);
  });
});
