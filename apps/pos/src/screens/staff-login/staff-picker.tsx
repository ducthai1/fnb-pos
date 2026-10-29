import { Store, Users } from "lucide-react";
import type { BootstrapStaff } from "../../features/bootstrap/bootstrap-source";
import { vi } from "../../messages/vi";
import { GateMark } from "../shared/gate-mark";
import { Icon } from "../shared/icon";
import { Alert, ScreenFrame } from "../shared/screen-frame";
import { StaffAvatar } from "../shared/staff-avatar";
import { EmptyState } from "../shared/state-view";

export function StaffPicker({
  branchName,
  staff,
  notice = null,
  onChoose,
}: {
  branchName: string;
  staff: readonly BootstrapStaff[];
  notice?: string | null;
  onChoose: (member: BootstrapStaff) => void;
}) {
  return (
    <ScreenFrame title={vi.staff.title} stage="wide" stageMark={<GateMark of={Users} />}>
      <div className="pos-gate__body pos-gate__body--list">
        <p className="pos-gate__branch pos-wrap">
          <Icon of={Store} size={18} />
          <span>{branchName}</span>
        </p>
        <Alert message={notice} tone="info" />
        {staff.length === 0 ? (
          <EmptyState title={vi.staff.noStaff} />
        ) : (
          <>
            <p className="pos-gate__lead">{vi.shell.pickStaffHint}</p>
            <div className="pos-gate__scroll">
              <ul className="pos-staff-grid">
                {staff.map((member) => (
                  <li key={member.id}>
                    <button
                      type="button"
                      className="pos-button pos-staff-button pos-wrap"
                      onClick={() => onChoose(member)}
                    >
                      <StaffAvatar id={member.id} name={member.displayName} />
                      <span className="pos-staff-button__name">{member.displayName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </ScreenFrame>
  );
}
