"use client";

import { type RoleHolders, roleHoldersSchema } from "@fnb/contracts";
import { useState } from "react";
import type { Role } from "../../lib/api/roles-api";
import { failureMessage, isSignedOut } from "../../lib/errors/failure-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { ConfirmPanel } from "../ui/confirm-panel";

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
    <ConfirmPanel
      title={T.archiveTitle(role.name)}
      hint={T.archiveHint}
      confirmLabel={T.archive}
      busyLabel={T.archiving}
      busy={busy}
      error={error}
      onConfirm={() => void archive()}
      onCancel={onCancel}
    >
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
    </ConfirmPanel>
  );
}
