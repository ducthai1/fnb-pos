"use client";

import { type RoleHolders, roleHoldersSchema } from "@fnb/contracts";
import { useId, useState } from "react";
import type { Role } from "../../lib/api/roles-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { ErrorNotice } from "../ui/error-notice";

const T = vi.staffTools;

/**
 * Putting a role away, after a confirming tap. A role someone still holds is refused, and
 * the refusal lists them, so the manager knows whom to move to another role first.
 */
export function RoleArchivePanel({ role, onDone, onCancel }: {
  role: Role;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const api = useApi();
  const { signedOut } = useSession();
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [holders, setHolders] = useState<RoleHolders | null>(null);

  async function archive() {
    setBusy(true);
    setError(null);
    setHolders(null);
    const result = await api.archiveRole(role.id);
    setBusy(false);
    if (result.ok) return onDone(T.archived(role.name));
    if (isSignedOut(result)) signedOut();
    const named = roleHoldersSchema.safeParse(result.body);
    if (named.success) return setHolders(named.data);
    setError(failureMessage(result));
  }

  return (
    <div className="bo-card bo-confirm bo-stack" role="alertdialog" aria-labelledby={titleId}>
      <p id={titleId} className="bo-subtitle bo-wrap">
        {T.archiveTitle(role.name)}
      </p>
      <p className="bo-muted bo-wrap">{T.archiveHint}</p>
      <ErrorNotice message={error} />
      {holders !== null && (
        <div className="bo-notice bo-notice--error bo-stack" role="alert">
          <p className="bo-wrap">{T.holdersTitle}</p>
          <ul className="bo-day-list__items">
            {holders.staff.map((holder) => (
              <li key={holder.id} className="bo-wrap" data-holder={holder.id}>
                {T.staffHolder(holder.displayName, holder.active)}
              </li>
            ))}
            {holders.members.map((holder) => (
              <li key={holder.id} className="bo-wrap" data-holder={holder.id}>
                {T.memberHolder(holder.displayName, holder.status)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="bo-row">
        <button type="button" className="bo-button bo-button--danger" disabled={busy} onClick={() => void archive()}>
          {busy ? T.archiving : T.archive}
        </button>
        <button type="button" className="bo-button" disabled={busy} onClick={onCancel}>
          {vi.common.cancel}
        </button>
      </div>
    </div>
  );
}
