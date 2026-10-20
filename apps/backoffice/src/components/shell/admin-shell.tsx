"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { SignedInUser } from "../../lib/api/auth-api";
import type { Branch } from "../../lib/api/branch-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { ErrorNotice } from "../ui/error-notice";
import { BranchPicker } from "./branch-picker";
import {
  type Session,
  SessionContext,
  initialBranch,
  rememberBranchId,
  rememberedBranchId,
} from "./session-context";

const T = vi.shell;

type Check = { phase: "checking" } | { phase: "failed"; message: string } | { phase: "ready"; user: SignedInUser };

export interface AdminShellProps {
  /** The links of the side menu; `onNavigate` closes the menu on a phone. */
  renderNav(onNavigate: () => void): ReactNode;
  /** No session (or it just ended): the app sends the person to the sign-in page. */
  onSignedOut(): void;
  children: ReactNode;
}

/**
 * Every signed-in page: checks the session first (GET /auth/me), then shows the side
 * menu, which folds into a button on a phone, and the branch the pages are about.
 */
export function AdminShell({ renderNav, onSignedOut, children }: AdminShellProps) {
  const api = useApi();
  const [check, setCheck] = useState<Check>({ phase: "checking" });
  const [branches, setBranches] = useState<readonly Branch[] | null>(null);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const checkSession = useCallback(async () => {
    setCheck({ phase: "checking" });
    const me = await api.me();
    if (me.ok) return setCheck({ phase: "ready", user: me.value });
    if (isSignedOut(me)) return onSignedOut();
    setCheck({ phase: "failed", message: failureMessage(me) });
  }, [api, onSignedOut]);

  useEffect(() => void checkSession(), [checkSession]);

  const ready = check.phase === "ready";
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
      <div className="bo-shell" data-nav-open={navOpen}>
        <header className="bo-topbar">
          <button
            type="button"
            className="bo-button bo-menu-toggle"
            aria-expanded={navOpen}
            aria-controls="bo-sidenav"
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? T.closeMenu : T.openMenu}
          </button>
          <span className="bo-topbar__name bo-wrap">{user.organizationName ?? T.appName}</span>
          <button type="button" className="bo-link-button" disabled={leaving} onClick={() => void logout()}>
            {leaving ? T.loggingOut : T.logout}
          </button>
        </header>
        <nav id="bo-sidenav" className="bo-sidenav" aria-label={T.navigation}>
          {renderNav(() => setNavOpen(false))}
          <p className="bo-sidenav__user bo-wrap">{user.displayName ?? user.accountId}</p>
        </nav>
        <main className="bo-main" data-scroll-root>
          <BranchPicker branches={branches} error={branchesError} />
          {children}
        </main>
      </div>
    </SessionContext.Provider>
  );
}
