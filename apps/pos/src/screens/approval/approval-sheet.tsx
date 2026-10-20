import { ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import type { ApiResult } from "../../features/api/api-result";
import { failureMessage } from "../../features/api/failure-message";
import type { BootstrapStaff } from "../../features/bootstrap/bootstrap-source";
import { vi } from "../../messages/vi";
import { PIN_FORMAT, PinPad } from "../shared/pin-pad";
import { Icon } from "../shared/icon";
import { ScreenFrame } from "../shared/screen-frame";
import { StaffAvatar } from "../shared/staff-avatar";

const A = vi.approval;
const SESSION_INVALID = "API_STAFF_SESSION_INVALID";

export interface ApprovalSheetProps {
  /** What is being approved, with its value: "Giảm 20% món Bạc xỉu L". */
  description: string;
  approvers: readonly BootstrapStaff[];
  approve(approverStaffId: string, pin: string): Promise<ApiResult<string>>;
  onApproved(approvalId: string, approverStaffId: string): void;
  /** Nothing was approved and nothing will be recorded. */
  onCancel(): void;
  onSessionExpired(): void;
}

/**
 * "Cần quản lý duyệt": what is asked, who approves it, their PIN. The server checks the PIN
 * and the approver's role, so asking needs the network; a refusal says why in Vietnamese.
 */
export function ApprovalSheet(props: ApprovalSheetProps) {
  const [chosen, setChosen] = useState<BootstrapStaff | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (chosen === null) return;
    if (!PIN_FORMAT.test(pin)) return setError(vi.staff.pinIncomplete);
    setBusy(true);
    setError(null);
    const result = await props.approve(chosen.id, pin);
    if (result.ok) return props.onApproved(result.value, chosen.id);
    if (result.code === SESSION_INVALID) return props.onSessionExpired();
    setPin("");
    setBusy(false);
    setError(result.status === null ? A.offline : failureMessage(result));
  }

  const choose = (member: BootstrapStaff | null) => {
    setChosen(member);
    setPin("");
    setError(null);
  };

  return (
    <ScreenFrame
      title={A.title}
      width="narrow"
      dock={
        <button type="button" className="pos-button" onClick={props.onCancel}>
          {A.cancel}
        </button>
      }
    >
      <section className="pos-card pos-approval pos-approval--asked" aria-label={A.title}>
        <span className="pos-approval__mark">
          <Icon of={ShieldCheck} size={28} />
        </span>
        <p className="pos-approval__what pos-wrap" data-approval-for={props.description}>
          {props.description}
        </p>
        <p className="pos-hint">{A.hint}</p>
      </section>
      {chosen === null ? (
        <ApproverList approvers={props.approvers} onChoose={choose} />
      ) : (
        <form
          className="pos-form pos-pin pos-signin pos-signin--center"
          onSubmit={submit}
          noValidate
        >
          <div className="pos-signin__who">
            <StaffAvatar id={chosen.id} name={chosen.displayName} size="lg" />
            <p className="pos-hint pos-wrap">{A.pinFor(chosen.displayName)}</p>
          </div>
          <PinPad
            pin={pin}
            onPin={setPin}
            error={error}
            busy={busy}
            submitLabel={A.approve}
            busyLabel={A.approving}
          />
          <button
            type="button"
            className="pos-button pos-button--quiet"
            onClick={() => choose(null)}
          >
            {A.otherApprover}
          </button>
        </form>
      )}
    </ScreenFrame>
  );
}

function ApproverList(props: {
  approvers: readonly BootstrapStaff[];
  onChoose(member: BootstrapStaff): void;
}) {
  if (props.approvers.length === 0) return <p className="pos-hint">{A.noApprover}</p>;
  return (
    <section aria-label={A.chooseApprover}>
      <h2 className="pos-group__legend">{A.chooseApprover}</h2>
      <ul className="pos-staff-grid">
        {props.approvers.map((member) => (
          <li key={member.id}>
            <button
              type="button"
              className="pos-button pos-staff-button pos-wrap"
              onClick={() => props.onChoose(member)}
            >
              <StaffAvatar id={member.id} name={member.displayName} />
              <span className="pos-staff-button__name">{member.displayName}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
