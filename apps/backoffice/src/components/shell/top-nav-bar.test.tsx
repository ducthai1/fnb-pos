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

/** The signed-in frame as the app draws it on a computer screen, the menu bar included. */
async function renderBar(path = "/", overrides: Partial<BackofficeApi> = {}) {
  route.path = path;
  screenOf(1280);
  render(
    <ApiProvider api={fakeBackofficeApi(overrides)}>
      <AdminShell renderNav={renderAdminNav} onSignedOut={() => {}}>
        <p>page</p>
      </AdminShell>
    </ApiProvider>,
  );
  return within(await screen.findByRole("navigation", { name: T.navigation }));
}

const signedInWith = (permissionKeys: (typeof OWNER.permissionKeys)[number][]) => ({
  me: async () => ok({ ...OWNER, permissionKeys }),
});
const names = (elements: HTMLElement[]) => elements.map((element) => element.textContent);

describe("the menu bar of a computer screen", () => {
  it("offers the owner the home page and every group, each listing its pages", async () => {
    const nav = await renderBar();
    expect(names(nav.getAllByRole("link"))).toEqual([N.home]);
    expect(names(nav.getAllByRole("button"))).toEqual([G.people, G.menu, G.sales, G.shop]);
    fireEvent.click(nav.getByRole("button", { name: G.sales }));
    expect(names(within(nav.getByRole("list", { name: G.sales })).getAllByRole("link"))).toEqual([
      N.dailySales,
      N.dayClose,
      N.transfers,
      N.printFailures,
    ]);
  });

  it("leaves out a group the member's keys open no page of", async () => {
    const nav = await renderBar("/", signedInWith(["view_reports"]));
    expect(names(nav.getAllByRole("button"))).toEqual([G.menu, G.sales]);
    fireEvent.click(nav.getByRole("button", { name: G.menu }));
    expect(names(within(nav.getByRole("list", { name: G.menu })).getAllByRole("link"))).toEqual([
      N.products,
      N.categories,
      N.availability,
    ]);
  });

  it("drops a group's list on a click, one list at a time, and closes it on a second click or a click outside", async () => {
    const nav = await renderBar();
    const menu = nav.getByRole("button", { name: G.menu });
    const people = nav.getByRole("button", { name: G.people });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(nav.queryByRole("link", { name: N.products })).toBeNull();
    fireEvent.click(menu);
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect(nav.getByRole("link", { name: N.products }).getAttribute("href")).toBe("/menu");
    fireEvent.click(people);
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(people.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(people);
    expect(people.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(menu);
    fireEvent.pointerDown(screen.getByText("page"));
    expect(menu.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens on the first page with the down arrow, walks the pages with the arrows, and Esc gives the heading back", async () => {
    const nav = await renderBar();
    const menu = nav.getByRole("button", { name: G.menu });
    menu.focus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(menu.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.textContent).toBe(N.products);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe(N.categories);
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement?.textContent).toBe(N.availability);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe(N.products);
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement?.textContent).toBe(N.availability);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(menu);
  });

  it("opens on the last page with the up arrow, closes with Esc on the heading, and walks the headings sideways", async () => {
    const nav = await renderBar();
    const sales = nav.getByRole("button", { name: G.sales });
    sales.focus();
    fireEvent.keyDown(sales, { key: "ArrowUp" });
    expect(document.activeElement?.textContent).toBe(N.printFailures);
    sales.focus();
    fireEvent.keyDown(sales, { key: "Escape" });
    expect(sales.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(sales, { key: "ArrowRight" });
    expect(document.activeElement).toBe(nav.getByRole("button", { name: G.shop }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(document.activeElement).toBe(nav.getByRole("link", { name: N.home }));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(nav.getByRole("button", { name: G.shop }));
  });

  it("closes the list once the focus leaves it, or a page of it is picked", async () => {
    const nav = await renderBar();
    const shop = nav.getByRole("button", { name: G.shop });
    fireEvent.click(shop);
    fireEvent.focusOut(shop, { relatedTarget: screen.getByRole("button", { name: T.logout }) });
    expect(shop.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(shop);
    fireEvent.focusOut(shop, { relatedTarget: nav.getByRole("link", { name: N.floor }) });
    expect(shop.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(nav.getByRole("link", { name: N.settings }), { ctrlKey: true });
    expect(shop.getAttribute("aria-expanded")).toBe("false");
  });

  it("marks the page on screen at its group's heading and in the group's list", async () => {
    const nav = await renderBar("/menu/products/abc");
    const menu = nav.getByRole("button", { name: G.menu });
    expect(menu.getAttribute("aria-current")).toBe("true");
    expect(nav.getAllByRole("button").filter((button) => button.hasAttribute("aria-current"))).toEqual([menu]);
    expect(nav.getByRole("link", { name: N.home }).hasAttribute("aria-current")).toBe(false);
    fireEvent.click(menu);
    const current = nav.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
    expect(names(current)).toEqual([N.products]);
  });

  it("marks the home page at its own link on the home page", async () => {
    const nav = await renderBar("/");
    expect(nav.getByRole("link", { name: N.home }).getAttribute("aria-current")).toBe("page");
    expect(nav.getAllByRole("button").some((button) => button.hasAttribute("aria-current"))).toBe(false);
  });
});
