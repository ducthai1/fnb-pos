import type { BootstrapStaff } from "../../features/bootstrap/bootstrap-source";
import { vi } from "../../messages/vi";
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
    <ScreenFrame title={vi.staff.title}>
      <Alert message={notice} tone="info" />
      <p className="pos-hint pos-wrap">{branchName}</p>
      {staff.length === 0 ? (
        <EmptyState title={vi.staff.noStaff} />
      ) : (
        <>
          <p className="pos-hint">{vi.shell.pickStaffHint}</p>
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
        </>
      )}
    </ScreenFrame>
  );
}
