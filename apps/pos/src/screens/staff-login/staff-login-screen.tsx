import { useState } from "react";
import type { ApiResult } from "../../features/api/api-result";
import type { StaffSession } from "../../features/api/pos-api";
import type { BootstrapStaff } from "../../features/bootstrap/bootstrap-source";
import { PinEntry } from "./pin-entry";
import { StaffPicker } from "./staff-picker";

export interface StaffLoginScreenProps {
  branchName: string;
  staff: readonly BootstrapStaff[];
  /** Why the till asks again, e.g. the staff session ran out; null when someone chose to. */
  notice?: string | null;
  signIn(staffId: string, pin: string): Promise<ApiResult<StaffSession>>;
  onSignedIn(staff: BootstrapStaff, session: StaffSession): void;
}

/** Who is at the till: pick a name, then that person's PIN. */
export function StaffLoginScreen(props: StaffLoginScreenProps) {
  const { branchName, staff, signIn, onSignedIn } = props;
  const [chosen, setChosen] = useState<BootstrapStaff | null>(null);
  if (chosen === null) {
    return (
      <StaffPicker
        branchName={branchName}
        staff={staff}
        notice={props.notice ?? null}
        onChoose={setChosen}
      />
    );
  }
  return (
    <PinEntry
      staff={chosen}
      signIn={signIn}
      onSignedIn={onSignedIn}
      onBack={() => setChosen(null)}
    />
  );
}
