"use client";

import type { Branch } from "../../lib/api/branch-api";
import { vi } from "../../messages/vi";
import { ErrorNotice } from "../ui/error-notice";
import { useSession } from "./session-context";

const T = vi.shell;

/** Which branch the branch-scoped pages (devices, sold-out items, menu) are about. */
export function BranchPicker({
  branches,
  error,
}: {
  branches: readonly Branch[] | null;
  error: string | null;
}) {
  const session = useSession();
  if (error !== null) return <ErrorNotice message={`${T.branchesFailed} ${error}`} />;
  if (branches === null) return <p className="bo-muted bo-loading">{T.loading}</p>;
  if (branches.length === 0) return <p className="bo-muted">{T.noBranches}</p>;
  return (
    <label className="bo-field bo-branch-picker">
      <span>{T.branchLabel}</span>
      <select
        className="bo-input"
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
