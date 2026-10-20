import type { PermissionAction } from "@fnb/domain";
import { type ReactNode, useCallback, useState } from "react";
import { ApprovalSheet } from "../../screens/approval/approval-sheet";
import { useTillPermissions } from "./till-permissions-context";

/** How asking for `action` ended; only "allowed" and "approved" may record the command. */
export type ApprovalOutcome =
  | { readonly kind: "allowed" }
  | { readonly kind: "approved"; readonly approvalId: string; readonly approverStaffId: string }
  | { readonly kind: "cancelled" }
  | { readonly kind: "denied" };

export interface ApprovalGate {
  /** The sheet asking a manager, while one is asked: the screen shows it in place of itself. */
  readonly sheet: ReactNode | null;
  /**
   * Allowed when the staff member's grants cover `action`, else a manager's approval of
   * exactly it (`description` says what, with its value), else denied.
   */
  require(action: PermissionAction, description: string): Promise<ApprovalOutcome>;
}

interface Asking {
  readonly action: PermissionAction;
  readonly description: string;
  resolve(outcome: ApprovalOutcome): void;
}

/** One flow for every sensitive action: discounts, voids, refunds, cash moves, the close. */
export function useApprovalGate(): ApprovalGate {
  const { authority, onSessionExpired } = useTillPermissions();
  const [asking, setAsking] = useState<Asking | null>(null);
  const require = useCallback(
    (action: PermissionAction, description: string) => {
      const decision = authority.decide(action);
      if (decision === "allowed") return Promise.resolve<ApprovalOutcome>({ kind: "allowed" });
      if (decision === "denied") return Promise.resolve<ApprovalOutcome>({ kind: "denied" });
      return new Promise<ApprovalOutcome>((resolve) => setAsking({ action, description, resolve }));
    },
    [authority],
  );
  const settle = (outcome: ApprovalOutcome) => {
    asking?.resolve(outcome);
    setAsking(null);
  };
  const sheet =
    asking === null ? null : (
      <ApprovalSheet
        description={asking.description}
        approvers={authority.approvers}
        approve={(approverId, pin) => authority.approve(asking.action, approverId, pin)}
        onApproved={(approvalId, approverStaffId) =>
          settle({ kind: "approved", approvalId, approverStaffId })
        }
        onCancel={() => settle({ kind: "cancelled" })}
        onSessionExpired={() => {
          settle({ kind: "cancelled" });
          onSessionExpired();
        }}
      />
    );
  return { sheet, require };
}
