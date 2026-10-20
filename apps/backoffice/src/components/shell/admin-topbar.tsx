"use client";

import { LogOut, Menu, X } from "lucide-react";
import type { SignedInUser } from "../../lib/api/auth-api";
import type { Branch } from "../../lib/api/branch-api";
import { vi } from "../../messages/vi";
import { Icon } from "../ui/icon";
import { BranchPicker } from "./branch-picker";

const T = vi.shell;

/** The first letter a person's name is drawn with, as one character a reader sees (emoji, marks). */
export function initialOf(name: string): string {
  const first = [...new Intl.Segmenter("vi", { granularity: "grapheme" }).segment(name.trim())][0]?.segment ?? "";
  return first.toLocaleUpperCase("vi");
}

/**
 * The bar over every page: the menu button (on a phone), the shop, the branch the pages are
 * about, and who is signed in with the way out.
 */
export function AdminTopbar({
  user,
  branches,
  branchesFailed,
  navOpen,
  onToggleNav,
  leaving,
  onLogout,
}: {
  user: SignedInUser;
  branches: readonly Branch[] | null;
  branchesFailed: boolean;
  navOpen: boolean;
  onToggleNav(): void;
  leaving: boolean;
  onLogout(): void;
}) {
  const name = user.displayName ?? user.accountId;
  return (
    <header className="bo-topbar">
      <button
        type="button"
        className="bo-icon-button bo-menu-toggle"
        aria-expanded={navOpen}
        aria-controls="bo-sidenav"
        onClick={onToggleNav}
      >
        <Icon of={navOpen ? X : Menu} size={22} />
        <span className="bo-sr-only">{navOpen ? T.closeMenu : T.openMenu}</span>
      </button>
      <span className="bo-topbar__name">
        <span className="bo-topbar__mark" aria-hidden="true" />
        <span className="bo-clip">{user.organizationName ?? T.appName}</span>
      </span>
      <div className="bo-topbar__branch">
        <BranchPicker branches={branches} failed={branchesFailed} />
      </div>
      <div className="bo-topbar__account" aria-label={T.account} role="group">
        <span className="bo-avatar" data-initial={initialOf(name)} aria-hidden="true" />
        <span className="bo-clip bo-topbar__person">{name}</span>
        <button type="button" className="bo-button bo-button--ghost bo-logout" disabled={leaving} onClick={onLogout}>
          <Icon of={LogOut} />
          <span className="bo-logout__label">{leaving ? T.loggingOut : T.logout}</span>
        </button>
      </div>
    </header>
  );
}
