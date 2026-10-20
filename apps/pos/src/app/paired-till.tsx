import type { LocalStore, RejectedCommand } from "@fnb/sync-client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { failureMessage } from "../features/api/failure-message";
import type { StaffSession } from "../features/api/pos-api";
import {
  type BootstrapSnapshot,
  type BootstrapStaff,
  staffWhoMaySignIn,
} from "../features/bootstrap/bootstrap-source";
import { INITIAL_SYNC_STATUS } from "../features/sync/till-sync-status";
import { BootstrapScreen } from "../screens/bootstrap/bootstrap-screen";
import { NeedsAttentionScreen } from "../screens/needs-attention/needs-attention-screen";
import { StaffLoginScreen } from "../screens/staff-login/staff-login-screen";
import type { DeviceCredential } from "../shell-bridge/device-credential-store";
import type { PosDependencies } from "./pos-dependencies";
import { StaffedTill } from "./staffed-till";
import { useBackgroundSync } from "./use-background-sync";

const noSubscription = () => () => {};
const initialStatus = () => INITIAL_SYNC_STATUS;

/** A paired till: the shop's data, then who is at the till, then selling. */
export function PairedTill(props: {
  deps: PosDependencies;
  store: LocalStore;
  credential: DeviceCredential;
}) {
  const { deps, credential } = props;
  const [snapshot, setSnapshot] = useState<BootstrapSnapshot | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<{ staff: BootstrapStaff; session: StaffSession } | null>(
    null,
  );
  const [rejected, setRejected] = useState<readonly RejectedCommand[] | null>(null);
  const staffToken = useRef<string | null>(null);
  const till = useBackgroundSync(deps, props.store, credential, staffToken);
  const status = useSyncExternalStore(
    till?.sync.subscribe ?? noSubscription,
    till?.sync.current ?? initialStatus,
  );

  const loadBootstrap = useCallback(async () => {
    setBootstrapError(null);
    const result = await deps.bootstrap.load(credential);
    if (result.ok) setSnapshot(result.value);
    else setBootstrapError(failureMessage(result));
  }, [deps, credential]);
  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  if (snapshot === null) return <BootstrapScreen error={bootstrapError} onRetry={loadBootstrap} />;
  if (signedIn === null) {
    return (
      <StaffLoginScreen
        branchName={snapshot.branch.name}
        staff={staffWhoMaySignIn(snapshot)}
        signIn={(staffId, pin) => deps.api.startStaffSession(credential, { staffId, pin })}
        onSignedIn={(staff, session) => {
          staffToken.current = session.token;
          setSignedIn({ staff, session });
          till?.sync.nudge();
        }}
      />
    );
  }
  if (rejected !== null) {
    return <NeedsAttentionScreen rejected={rejected} onBack={() => setRejected(null)} />;
  }
  return (
    <StaffedTill
      snapshot={snapshot}
      till={till}
      staff={signedIn.staff}
      status={status}
      printer={deps.printer}
      onOpenNeedsAttention={() => {
        void till?.client.rejectedCommands().then(setRejected);
      }}
      onSwitchStaff={() => {
        staffToken.current = null;
        setSignedIn(null);
      }}
    />
  );
}
