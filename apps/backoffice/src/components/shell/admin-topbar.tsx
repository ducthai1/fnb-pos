"use client";

import { Coffee, LogOut, Menu, X } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import type { SignedInUser } from "../../lib/api/auth-api";
import type { Branch } from "../../lib/api/branch-api";
import { vi } from "../../messages/vi";
import { Icon } from "../ui/icon";
import { BranchPicker } from "./branch-picker";
import { NAV_DRAWER_ID } from "./nav-drawer";

const T = vi.shell;

/** The first letter a person's name is drawn with, as one character a reader sees (emoji, marks). */
export function initialOf(name: string): string {
  const first = [...new Intl.Segmenter("vi", { granularity: "grapheme" }).segment(name.trim())][0]?.segment ?? "";
  return first.toLocaleUpperCase("vi");
}

/** The button that opens the menu drawer where the screen has no room for the menu bar. */
export interface MenuButton {
  ref: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onToggle(): void;
}

/**
 * The bar over every page: the shop, the branch the pages are about, and who is signed in
 * with the way out; under it the menu bar (`children`) on a computer, or before the shop
 * the button of the menu drawer (`menuButton`) on a phone or a tablet.
 */
export function AdminTopbar({
  user,
  branches,
  branchesFailed,
  menuButton,
  leaving,
  onLogout,
  children,
}: {
  user: SignedInUser;
  branches: readonly Branch[] | null;
  branchesFailed: boolean;
  menuButton: MenuButton | null;
  leaving: boolean;
  onLogout(): void;
  children?: ReactNode;
}) {
  const name = user.displayName ?? user.accountId;
  return (
    <header className="bo-topbar">
      <div className="bo-topbar__inner" data-frame="bar">
      <div className="bo-topbar__row">
        {menuButton && (
          <button
            ref={menuButton.ref}
            type="button"
            className="bo-icon-button bo-menu-toggle"
            aria-expanded={menuButton.open}
            aria-controls={menuButton.open ? NAV_DRAWER_ID : undefined}
            onClick={menuButton.onToggle}
          >
            <Icon of={menuButton.open ? X : Menu} size={22} />
            <span className="bo-sr-only">{menuButton.open ? T.closeMenu : T.openMenu}</span>
          </button>
        )}
        <span className="bo-topbar__name" data-frame="brand">
          <span className="bo-topbar__mark" aria-hidden="true">
            <Icon of={Coffee} size={20} />
          </span>
          <span className="bo-clip">{user.organizationName ?? T.appName}</span>
        </span>
        <div className="bo-topbar__branch">
          <BranchPicker branches={branches} failed={branchesFailed} />
        </div>
        <div className="bo-topbar__account" aria-label={T.account} role="group" data-frame="account">
          <span className="bo-avatar" data-initial={initialOf(name)} aria-hidden="true" />
          <span className="bo-clip bo-topbar__person">{name}</span>
          <button
            type="button"
            className="bo-button bo-button--ghost bo-logout"
            title={T.logout}
            disabled={leaving}
            onClick={onLogout}
          >
            <Icon of={LogOut} />
            <span className="bo-logout__label">{leaving ? T.loggingOut : T.logout}</span>
          </button>
        </div>
      </div>
      {children}
      </div>
    </header>
  );
}
