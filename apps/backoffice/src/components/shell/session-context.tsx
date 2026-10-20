"use client";

import { createContext, useContext } from "react";
import type { SignedInUser } from "../../lib/api/auth-api";
import type { Branch } from "../../lib/api/branch-api";

export interface Session {
  readonly user: SignedInUser;
  /** null while loading or when the list could not be read. */
  readonly branches: readonly Branch[] | null;
  /** The branch every branch-scoped page shows; null until branches are known. */
  readonly branch: Branch | null;
  selectBranch(branchId: string): void;
  /** The API said the session is gone (401): back to the sign-in page. */
  signedOut(): void;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) throw new Error("useSession outside AdminShell");
  return session;
}

const BRANCH_KEY = "fnb.backoffice.branchId";

// A remembered choice is a convenience only: storage can be blocked or empty, and the
// page must still work, so every access is guarded and a miss falls back to the first.
export function rememberedBranchId(): string | null {
  try {
    return window.localStorage.getItem(BRANCH_KEY);
  } catch {
    return null;
  }
}

export function rememberBranchId(branchId: string): void {
  try {
    window.localStorage.setItem(BRANCH_KEY, branchId);
  } catch {
    // Not remembered: the next visit starts from the first branch again.
  }
}

/** The remembered branch when it is still in the list, else the first one. */
export function initialBranch(branches: readonly Branch[], remembered: string | null) {
  return branches.find((branch) => branch.id === remembered) ?? branches[0] ?? null;
}
