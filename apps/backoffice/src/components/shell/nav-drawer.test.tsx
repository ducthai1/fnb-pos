import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackofficeApi } from "../../lib/api/backoffice-api";
import { vi as messages } from "../../messages/vi";
import { OWNER, fakeBackofficeApi, ok } from "../../test-support/fake-backoffice-api";
import { forgetScreen, screenOf } from "../../test-support/screen-width";
import { ApiProvider } from "../app/api-context";
import { AdminShell } from "./admin-shell";
import { renderAdminNav } from "./render-admin-nav";

const route = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.path }));

const T = messages.shell;
const G = T.groups;
const N = T.nav;

afterEach(() => {
  forgetScreen();
  route.path = "/";
});

/** The signed-in frame as the app draws it on a screen of `width`, its drawer still shut. */
async function renderNarrow(width: number, path = "/", overrides: Partial<BackofficeApi> = {}) {
  route.path = path;
  screenOf(width);
  render(
    <ApiProvider api={fakeBackofficeApi(overrides)}>
      <AdminShell renderNav={renderAdminNav} onSignedOut={() => {}}>
        <p>page</p>
      </AdminShell>
    </ApiProvider>,
  );
  return screen.findByRole("button", { name: T.openMenu });
}

const openDrawer = (toggle: HTMLElement) => {
  fireEvent.click(toggle);
  return within(screen.getByRole("navigation", { name: T.navigation }));
};
const names = (elements: HTMLElement[]) => elements.map((element) => element.textContent);

describe("the menu drawer of a phone or a tablet", () => {
  it.each([360, 800])("lists every page by its group at %ipx and takes the focus on the first", async (width) => {
    const drawer = openDrawer(await renderNarrow(width));
    expect(names(within(drawer.getByRole("list", { name: G.people })).getAllByRole("link"))).toEqual([
      N.devices,
      N.staff,
      N.roles,
    ]);
    expect(names(within(drawer.getByRole("list", { name: G.shop })).getAllByRole("link"))).toEqual([N.floor, N.settings]);
    expect(drawer.getAllByRole("link")).toHaveLength(15);
    expect(document.activeElement).toBe(drawer.getByRole("link", { name: N.home }));
  });

  it("offers only the pages the member's keys open", async () => {
    const drawer = openDrawer(await renderNarrow(360, "/", { me: async () => ok({ ...OWNER, permissionKeys: ["manage_settings"] }) }));
    expect(names(drawer.getAllByRole("link"))).toEqual([N.home, N.products, N.categories, N.availability, N.priceLists, N.stations, N.floor, N.settings]);
    expect(drawer.queryByText(G.sales)).toBeNull();
  });

  it("closes on Esc and gives the focus back to the menu button", async () => {
    const toggle = await renderNarrow(360);
    openDrawer(toggle);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("closes on a tap beside it, on the menu button, and once a page is picked", async () => {
    const toggle = await renderNarrow(800);
    openDrawer(toggle);
    fireEvent.click(document.querySelector(".bo-shell__backdrop")!);
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(document.activeElement).toBe(toggle);
    openDrawer(toggle);
    fireEvent.click(screen.getByRole("button", { name: T.closeMenu }));
    expect(screen.queryByRole("navigation")).toBeNull();
    const drawer = openDrawer(toggle);
    fireEvent.click(drawer.getByRole("link", { name: N.staff }), { ctrlKey: true });
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("marks the page on screen in the drawer", async () => {
    const drawer = openDrawer(await renderNarrow(360, "/menu/categories"));
    const current = drawer.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(names(current)).toEqual([N.categories]);
  });
});
