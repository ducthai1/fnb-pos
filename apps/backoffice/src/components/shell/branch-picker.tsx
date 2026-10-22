"use client";

import { Store } from "lucide-react";
import type { Branch } from "../../lib/api/branch-api";
import { vi } from "../../messages/vi";
import { ErrorNotice } from "../ui/error-notice";
import { Listbox } from "../ui/listbox";
import { useSession } from "./session-context";

const T = vi.shell;

/** Which branch the branch-scoped pages (devices, sold-out items, menu) are about. */
export function BranchPicker({ branches, failed }: { branches: readonly Branch[] | null; failed: boolean }) {
  const session = useSession();
  if (failed) return null;
  if (branches === null) return <p className="bo-muted bo-loading">{T.loading}</p>;
  if (branches.length === 0) return null;
  return (
    <Listbox
      className="bo-branch-picker bo-listbox--end"
      label={T.branchLabel}
      hideLabel
      icon={Store}
      value={session.branch?.id ?? ""}
      choices={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
      onChange={(id) => session.selectBranch(id)}
    />
  );
}

/** What stops the branch list showing, said in the page itself where there is room for it. */
export function BranchNotice({ branches, error }: { branches: readonly Branch[] | null; error: string | null }) {
  if (error !== null) return <ErrorNotice message={`${T.branchesFailed} ${error}`} />;
  if (branches !== null && branches.length === 0) return <p className="bo-muted">{T.noBranches}</p>;
  return null;
}
