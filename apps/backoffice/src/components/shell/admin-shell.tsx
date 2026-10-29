"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SignedInUser } from "../../lib/api/auth-api";
import type { Branch } from "../../lib/api/branch-api";
import { backofficeReporter } from "../../lib/client-errors/reporter-instance";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { usePresence } from "../../lib/motion/use-presence";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { ErrorNotice } from "../ui/error-notice";
import { AdminTopbar } from "./admin-topbar";
import { BranchNotice } from "./branch-picker";
import { NavDrawer } from "./nav-drawer";
import {
  type Session,
  SessionContext,
  initialBranch,
  rememberBranchId,
  rememberedBranchId,
} from "./session-context";
import { ThemePicker } from "./theme-picker";
import { useWideScreen } from "./use-wide-screen";

const T = vi.shell;

/**
 * Tells the frame how wide the page's scrollbar is, so the bar over it keeps the same right
 * edge as the page (both stand in one fluid column, backoffice-shell.css).
 */
function watchScrollbar(main: HTMLElement | null) {
  if (main === null || typeof ResizeObserver === "undefined") return;
  const frame = main.parentElement;
  const measure = () => frame?.style.setProperty("--scrollbar-w", `${main.offsetWidth - main.clientWidth}px`);
  const observer = new ResizeObserver(measure);
  observer.observe(main);
  measure();
  return () => observer.disconnect();
}

type Check = { phase: "checking" } | { phase: "failed"; message: string } | { phase: "ready"; user: SignedInUser };

/** Where the menu is drawn: a bar across the top of a computer screen, or a drawer. */
export type NavLayout = "bar" | "drawer";

export interface AdminShellProps {
  /** The pages of the menu, laid out for `layout`; `onNavigate` closes the drawer. */
  renderNav(layout: NavLayout, onNavigate: () => void): ReactNode;
  /** No session (or it just ended): the app sends the person to the sign-in page. */
  onSignedOut(): void;
  children: ReactNode;
}

/**
 * Every signed-in page: checks the session first (GET /auth/me), then shows the bar (shop,
 * branch, account) with the menu across the top on a computer, or behind a button in a
 * drawer on a phone or a tablet; the page takes the whole width under it.
 */
export function AdminShell({ renderNav, onSignedOut, children }: AdminShellProps) {
  const api = useApi();
  const [check, setCheck] = useState<Check>({ phase: "checking" });
  const [branches, setBranches] = useState<readonly Branch[] | null>(null);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const wide = useWideScreen();
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawerOpen = navOpen && !wide;
  // The drawer stays, inert, while it plays its leaving movement.
  const drawer = usePresence(drawerOpen, "--t-drawer-out");
  const closeNav = useCallback(() => setNavOpen(false), []);
  // A drawer left open as the screen widens would show again once it narrows.
  useEffect(() => {
    if (wide) setNavOpen(false);
  }, [wide]);

  const checkSession = useCallback(async () => {
    setCheck({ phase: "checking" });
    const me = await api.me();
    if (me.ok) return setCheck({ phase: "ready", user: me.value });
    if (isSignedOut(me)) return onSignedOut();
    setCheck({ phase: "failed", message: failureMessage(me) });
  }, [api, onSignedOut]);

  useEffect(() => void checkSession(), [checkSession]);

  const ready = check.phase === "ready";
  // Faults the page hit are sent once a member is signed in (the API takes them from a session).
  useEffect(() => {
    backofficeReporter().setSignedIn(ready);
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    void api.listBranches().then((result) => {
      if (!result.ok) {
        if (isSignedOut(result)) return onSignedOut();
        return setBranchesError(failureMessage(result));
      }
      setBranches(result.value);
      setBranchId(initialBranch(result.value, rememberedBranchId())?.id ?? null);
    });
  }, [api, ready, onSignedOut]);

  const session = useMemo<Session | null>(() => {
    if (check.phase !== "ready") return null;
    return {
      user: check.user,
      branches,
      branch: branches?.find((branch) => branch.id === branchId) ?? null,
      selectBranch: (id) => {
        setBranchId(id);
        rememberBranchId(id);
      },
      signedOut: onSignedOut,
    };
  }, [check, branches, branchId, onSignedOut]);

  async function logout() {
    setLeaving(true);
    await api.logout();
    onSignedOut();
  }

  if (check.phase === "checking") return <p className="bo-splash bo-loading">{T.loading}</p>;
  if (check.phase === "failed" || session === null) {
    return (
      <div className="bo-splash">
        <ErrorNotice message={check.phase === "failed" ? check.message : T.sessionFailed} />
        <button type="button" className="bo-button" onClick={() => void checkSession()}>
          {T.retry}
        </button>
      </div>
    );
  }
  const { user } = session;
  return (
    <SessionContext.Provider value={session}>
      <div className="bo-shell" data-nav-open={drawerOpen}>
        <AdminTopbar
          user={user}
          branches={branches}
          branchesFailed={branchesError !== null}
          menuButton={wide ? null : { ref: menuButton, open: drawerOpen, onToggle: () => setNavOpen((open) => !open) }}
          leaving={leaving}
          onLogout={() => void logout()}
        >
          {wide && (
            <nav className="bo-topnav" aria-label={T.navigation}>
              {renderNav("bar", closeNav)}
            </nav>
          )}
        </AdminTopbar>
        {drawer.present && (
          <NavDrawer menuButton={menuButton} leaving={drawer.leaving} onClose={closeNav}>
            {renderNav("drawer", closeNav)}
            <div className="bo-drawer__look">
              <ThemePicker placement="drawer" />
            </div>
          </NavDrawer>
        )}
        <main ref={watchScrollbar} className="bo-main" data-scroll-root>
          <BranchNotice branches={branches} error={branchesError} />
          {children}
        </main>
      </div>
    </SessionContext.Provider>
  );
}
