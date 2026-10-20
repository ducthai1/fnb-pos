"use client";

import { Store } from "lucide-react";
import type { Branch } from "../../lib/api/branch-api";
import { vi } from "../../messages/vi";
import { ErrorNotice } from "../ui/error-notice";
import { Icon } from "../ui/icon";
import { useSession } from "./session-context";

const T = vi.shell;

/** Which branch the branch-scoped pages (devices, sold-out items, menu) are about. */
export function BranchPicker({ branches, failed }: { branches: readonly Branch[] | null; failed: boolean }) {
  const session = useSession();
  if (failed) return null;
  if (branches === null) return <p className="bo-muted bo-loading">{T.loading}</p>;
  if (branches.length === 0) return null;
  return (
    <label className="bo-branch-picker">
      <Icon of={Store} />
      <span className="bo-sr-only">{T.branchLabel}</span>
      <select
        className="bo-input bo-branch-picker__select"
        value={session.branch?.id ?? ""}
        onChange={(event) => session.selectBranch(event.target.value)}
      >
        {branches.map((branch) => (
          <option key={branch.id} value={branch.id}>
            {branch.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** What stops the branch list showing, said in the page itself where there is room for it. */
export function BranchNotice({ branches, error }: { branches: readonly Branch[] | null; error: string | null }) {
  if (error !== null) return <ErrorNotice message={`${T.branchesFailed} ${error}`} />;
  if (branches !== null && branches.length === 0) return <p className="bo-muted">{T.noBranches}</p>;
  return null;
}
