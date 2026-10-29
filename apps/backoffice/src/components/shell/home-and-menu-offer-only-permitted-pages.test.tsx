import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sectionsFor } from "../../lib/navigation/admin-sections";
import { vi as messages } from "../../messages/vi";
import { OWNER, ok } from "../../test-support/fake-backoffice-api";
import { renderSignedIn } from "../../test-support/render-signed-in";
import { HomeScreen } from "./home-screen";
import { DrawerNavLinks } from "./drawer-nav-links";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const N = messages.shell.nav;
const MENU_PAGES = [N.products, N.categories, N.availability, N.priceLists];
const REPORT_PAGES = [N.dailySales, N.dayClose, N.transfers, N.printFailures];

const signedInWith = (permissionKeys: typeof OWNER.permissionKeys[number][]) => ({
  me: async () => ok({ ...OWNER, permissionKeys }),
});

const linkNames = (container: HTMLElement) =>
  within(container).getAllByRole("link").map((link) => link.textContent);

describe("which pages the menu drawer and the home page offer", () => {
  it("offers the owner every page", async () => {
    await renderSignedIn(<DrawerNavLinks onNavigate={() => {}} />);
    expect(linkNames(document.body)).toEqual([N.home, N.devices, N.staff, N.roles, ...MENU_PAGES, ...REPORT_PAGES, N.floor, N.settings]);
  });

  it("leaves out the pages whose key the member's role lacks", async () => {
    await renderSignedIn(<DrawerNavLinks onNavigate={() => {}} />, signedInWith(["manage_devices"]));
    expect(linkNames(document.body)).toEqual([N.home, N.devices, ...MENU_PAGES]);
  });

  it("still offers the menu pages, which any member may read, to a member with no key", async () => {
    await renderSignedIn(<HomeScreen />, signedInWith([]));
    expect(linkNames(screen.getByRole("list"))).toEqual(MENU_PAGES);
  });

  it("puts each page under its group's heading and leaves a group with no page out", async () => {
    await renderSignedIn(<DrawerNavLinks onNavigate={() => {}} />, signedInWith(["view_reports"]));
    const G = messages.shell.groups;
    const groupLinks = (heading: string) => linkNames(screen.getByRole("list", { name: heading }));
    expect(groupLinks(G.menu)).toEqual(MENU_PAGES);
    expect(groupLinks(G.sales)).toEqual(REPORT_PAGES);
    expect(screen.queryByText(G.people)).toBeNull();
    expect(screen.queryByText(G.shop)).toBeNull();
  });

  it("offers the floor plan and settings only with manage_settings", async () => {
    await renderSignedIn(<DrawerNavLinks onNavigate={() => {}} />, signedInWith(["manage_settings"]));
    expect(linkNames(document.body)).toEqual([N.home, ...MENU_PAGES, N.floor, N.settings]);
  });

  it("offers the reports, day close and transfers only with view_reports", async () => {
    await renderSignedIn(<DrawerNavLinks onNavigate={() => {}} />, signedInWith(["view_reports"]));
    expect(linkNames(document.body)).toEqual([N.home, ...MENU_PAGES, ...REPORT_PAGES]);
  });

  it("opens staff and roles with manage_staff alone", () => {
    expect(sectionsFor(["manage_staff"]).map((section) => section.href)).toEqual([
      "/staff",
      "/roles",
      "/menu",
      "/menu/categories",
      "/menu/availability",
      "/menu/price-lists",
    ]);
  });
});
