import type { Grant } from "@fnb/domain";
import type { LocalStore, RejectedCommand } from "@fnb/sync-client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { failureMessage } from "../features/api/failure-message";
import type { StaffSession } from "../features/api/pos-api";
import {
  type BootstrapSnapshot,
  type BootstrapStaff,
  staffWhoMaySignIn,
  tillPlaceOf,
} from "../features/bootstrap/bootstrap-source";
import { useSettledQrClosing } from "../features/payment/use-settled-qr-closing";
import { tillAuthority } from "../features/permissions/till-authority";
import { TillPermissionsProvider } from "../features/permissions/till-permissions-context";
import { INITIAL_SYNC_STATUS } from "../features/sync/till-sync-status";
import { vi } from "../messages/vi";
import { BootstrapScreen } from "../screens/bootstrap/bootstrap-screen";
import { NeedsAttentionScreen } from "../screens/needs-attention/needs-attention-screen";
import { StaffLoginScreen } from "../screens/staff-login/staff-login-screen";
import type { DeviceCredential } from "../shell-bridge/device-credential-store";
import type { PosDependencies } from "./pos-dependencies";
import { StaffedTill } from "./staffed-till";
import { useBackgroundSync } from "./use-background-sync";

const noSubscription = () => () => {};
const initialStatus = () => INITIAL_SYNC_STATUS;

interface SignedIn {
  readonly staff: BootstrapStaff;
  readonly session: StaffSession;
  /** What they may do alone; none when the server's answer could not be read. */
  readonly grants: readonly Grant[];
}

/** A paired till: the shop's data, then who is at the till, then selling. */
export function PairedTill(props: {
  deps: PosDependencies;
  store: LocalStore;
  credential: DeviceCredential;
}) {
  const { deps, credential } = props;
  const [snapshot, setSnapshot] = useState<BootstrapSnapshot | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<SignedIn | null>(null);
  /** Why the PIN screen is showing again, when it was not someone's choice. */
  const [signInNotice, setSignInNotice] = useState<string | null>(null);
  const [rejected, setRejected] = useState<readonly RejectedCommand[] | null>(null);
  const staffToken = useRef<string | null>(null);
  const till = useBackgroundSync(deps, props.store, credential, staffToken);
  const status = useSyncExternalStore(
    till?.sync.subscribe ?? noSubscription,
    till?.sync.current ?? initialStatus,
  );
  const place = useMemo(() => (snapshot === null ? null : tillPlaceOf(snapshot)), [snapshot]);
  const settledQr = useSettledQrClosing(till?.client ?? null, place, rejected);

  const loadBootstrap = useCallback(async () => {
    setBootstrapError(null);
    const result = await deps.bootstrap.load(credential);
    if (result.ok) setSnapshot(result.value);
    else setBootstrapError(failureMessage(result));
  }, [deps, credential]);
  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);
  const loadFloor = useCallback(() => deps.floor.load(credential), [deps, credential]);
  const signOut = useCallback((notice: string | null) => {
    staffToken.current = null;
    setSignedIn(null);
    setSignInNotice(notice);
  }, []);
  const permissions = useMemo(() => {
    if (signedIn === null || snapshot === null) return null;
    const token = signedIn.session.token;
    return {
      authority: tillAuthority({
        staffId: signedIn.staff.id,
        grants: signedIn.grants,
        staff: staffWhoMaySignIn(snapshot),
        requestApproval: (request) => deps.api.requestApproval(credential, token, request),
      }),
      onSessionExpired: () => signOut(vi.errors.API_STAFF_SESSION_INVALID),
    };
  }, [signedIn, snapshot, deps, credential, signOut]);

  if (snapshot === null) return <BootstrapScreen error={bootstrapError} onRetry={loadBootstrap} />;
  if (signedIn === null || permissions === null) {
    return (
      <StaffLoginScreen
        branchName={snapshot.branch.name}
        staff={staffWhoMaySignIn(snapshot)}
        notice={signInNotice}
        signIn={(staffId, pin) => deps.api.startStaffSession(credential, { staffId, pin })}
        onSignedIn={(staff, session) => {
          staffToken.current = session.token;
          void deps.api.staffGrants(credential, session.token).then((answer) => {
            setSignInNotice(null);
            setSignedIn({ staff, session, grants: answer.ok ? answer.value : [] });
            till?.sync.nudge();
          });
        }}
      />
    );
  }
  if (rejected !== null) {
    return (
      <NeedsAttentionScreen
        rejected={rejected}
        closable={settledQr.closable}
        onCloseWithSettledQr={(orderId) => {
          settledQr.close(orderId).then(() => till?.sync.nudge(), console.error);
        }}
        onBack={() => setRejected(null)}
      />
    );
  }
  return (
    <TillPermissionsProvider value={permissions}>
      <StaffedTill
        snapshot={snapshot}
        till={till}
        staff={signedIn.staff}
        status={status}
        printer={deps.printer}
        loadFloor={loadFloor}
        onOpenNeedsAttention={() => {
          void till?.client.rejectedCommands().then(setRejected);
        }}
        onSwitchStaff={() => signOut(null)}
      />
    </TillPermissionsProvider>
  );
}
