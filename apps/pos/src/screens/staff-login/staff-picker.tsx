import type { BootstrapStaff } from "../../features/bootstrap/bootstrap-source";
import { vi } from "../../messages/vi";
import { Alert, ScreenFrame } from "../shared/screen-frame";

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
      <Alert message={notice} />
      <p className="pos-hint pos-wrap">{branchName}</p>
      {staff.length === 0 ? (
        <p className="pos-hint">{vi.staff.noStaff}</p>
      ) : (
        <ul className="pos-staff-grid">
          {staff.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                className="pos-button pos-staff-button pos-wrap"
                onClick={() => onChoose(member)}
              >
                {member.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </ScreenFrame>
  );
}
