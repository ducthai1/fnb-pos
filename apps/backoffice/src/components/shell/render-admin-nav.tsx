"use client";

import type { NavLayout } from "./admin-shell";
import { DrawerNavLinks } from "./drawer-nav-links";
import { TopNavBar } from "./top-nav-bar";

/** The menu of the signed-in pages as the shell lays it out: the bar, or the drawer's list. */
export function renderAdminNav(layout: NavLayout, onNavigate: () => void) {
  return layout === "bar" ? <TopNavBar /> : <DrawerNavLinks onNavigate={onNavigate} />;
}
