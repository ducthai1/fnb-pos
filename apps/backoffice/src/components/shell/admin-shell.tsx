"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { SignedInUser } from "../../lib/api/auth-api";
import type { Branch } from "../../lib/api/branch-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { ErrorNotice } from "../ui/error-notice";
import { Icon } from "../ui/icon";
import { AdminTopbar } from "./admin-topbar";
import { BranchNotice } from "./branch-picker";
import { rememberedCollapse, rememberCollapse } from "./nav-collapse";
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
 * Every signed-in page: checks the session first (GET /auth/me), then shows the bar (shop,
 * branch, account) and the side menu, which narrows to its icons on a computer and folds
 * behind a button on a phone.
 */
export function AdminShell({ renderNav, onSignedOut, children }: AdminShellProps) {
  const api = useApi();
  const [check, setCheck] = useState<Check>({ phase: "checking" });
  const [branches, setBranches] = useState<readonly Branch[] | null>(null);
  const [branchesError, setBranchesError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(rememberedCollapse);
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
  const toggleCollapse = () => {
    setCollapsed(!collapsed);
    rememberCollapse(!collapsed);
  };
  return (
    <SessionContext.Provider value={session}>
      <div className="bo-shell" data-nav-open={navOpen} data-nav-collapsed={collapsed}>
        <AdminTopbar
          user={user}
          branches={branches}
          branchesFailed={branchesError !== null}
          navOpen={navOpen}
          onToggleNav={() => setNavOpen((open) => !open)}
          leaving={leaving}
          onLogout={() => void logout()}
        />
        <nav id="bo-sidenav" className="bo-sidenav" aria-label={T.navigation}>
          {renderNav(() => setNavOpen(false))}
          <button
            type="button"
            className="bo-sidenav__collapse"
            aria-controls="bo-sidenav"
            aria-expanded={!collapsed}
            onClick={toggleCollapse}
          >
            <Icon of={collapsed ? PanelLeftOpen : PanelLeftClose} size={20} />
            <span className="bo-sidenav__label">{collapsed ? T.expandMenu : T.collapseMenu}</span>
          </button>
        </nav>
        {navOpen && <div className="bo-shell__backdrop" aria-hidden="true" onClick={() => setNavOpen(false)} />}
        <main className="bo-main" data-scroll-root>
          <BranchNotice branches={branches} error={branchesError} />
          {children}
        </main>
      </div>
    </SessionContext.Provider>
  );
}
