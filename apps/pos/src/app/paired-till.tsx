import type { WalletPaymentBody } from "@fnb/contracts";
import type { Grant } from "@fnb/domain";
import type { LocalStore, RejectedCommand } from "@fnb/sync-client";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { failureMessage } from "../features/api/failure-message";
import type { StaffSession } from "../features/api/pos-api";
import {
  type BootstrapSnapshot,
  type BootstrapStaff,
  staffWhoMaySignIn,
  tillPlaceOf,
} from "../features/bootstrap/bootstrap-source";
import { useTillStaff } from "../features/bootstrap/use-till-staff";
import { tillAuthority } from "../features/permissions/till-authority";
import { TillPermissionsProvider } from "../features/permissions/till-permissions-context";
import { useTillShift } from "../features/shift/use-till-shift";
import { INITIAL_SYNC_STATUS } from "../features/sync/till-sync-status";
import { vi } from "../messages/vi";
import { BootstrapScreen } from "../screens/bootstrap/bootstrap-screen";
import { UpdateBanner } from "../screens/update/update-banner";
import { ServerRestoreNotice } from "../screens/sales-home/server-restore-notice";
import { TillClockNotice } from "../screens/sales-home/till-clock-notice";
import { StaffLoginScreen } from "../screens/staff-login/staff-login-screen";
import type { DeviceCredential } from "../shell-bridge/device-credential-store";
import { NeedsAttentionFlow } from "./needs-attention-flow";
import type { PosDependencies } from "./pos-dependencies";
import { StaffedTill } from "./staffed-till";
import { newTillStaffSessions, signInto } from "./till-staff-sessions";
import { useAppUpdate } from "./use-app-update";
import { useBackgroundSync } from "./use-background-sync";

const noSubscription = () => () => {};
const initialStatus = () => INITIAL_SYNC_STATUS;

interface SignedIn {
  readonly staff: BootstrapStaff;
  readonly session: StaffSession;
  /** What they may do alone; none when the server's answer could not be read. */
  readonly grants: readonly Grant[];
}

const NO_STAFF: readonly BootstrapStaff[] = [];

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
  const sessions = useRef(newTillStaffSessions());
  const signOutRef = useRef<(notice: string | null) => void>(() => {});
  const till = useBackgroundSync(deps, props.store, credential, sessions, (token) => {
    // The server no longer knows the session the till pushed with: the PIN screen again,
    // when it is the current one (an earlier cashier's ending changes nothing for this one).
    if (sessions.current.current?.token === token) {
      signOutRef.current(vi.errors.API_STAFF_SESSION_INVALID);
    }
  });
  const status = useSyncExternalStore(
    till?.sync.subscribe ?? noSubscription,
    till?.sync.current ?? initialStatus,
  );
  useEffect(() => {
    deps.clientErrors?.authenticate(credential.deviceToken);
    return () => deps.clientErrors?.authenticate(null);
  }, [deps, credential]);
  // A pass that reached the server is the moment queued fault reports can go too.
  useEffect(() => {
    if (status.connection === "online") void deps.clientErrors?.flush();
  }, [deps, status]);
  const shift = useTillShift(till?.client ?? null, credential.deviceId);
  const update = useAppUpdate(
    deps.updates,
    shift,
    status.connection === "checking" ? null : status.pending,
    deps.reload,
  );
  const banner = (
    <UpdateBanner
      open={update.decision.action === "banner"}
      blockedBy={update.decision.action === "banner" ? update.decision.blockedBy : null}
      pendingCommands={status.pending}
      updating={update.updating}
      onUpdate={update.updateNow}
    />
  );
  const withBanner = (screen: ReactNode) => (
    <>
      {screen}
      {banner}
    </>
  );
  const place = useMemo(() => (snapshot === null ? null : tillPlaceOf(snapshot)), [snapshot]);
  const staff = useTillStaff(snapshot?.staff ?? NO_STAFF, till?.client ?? null);

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
    // The session's credential stays known: its commands still waiting go under it.
    sessions.current.current = null;
    setSignedIn(null);
    setSignInNotice(notice);
  }, []);
  signOutRef.current = signOut;
  const permissions = useMemo(() => {
    if (signedIn === null || snapshot === null) return null;
    const token = signedIn.session.token;
    return {
      authority: tillAuthority({
        staffId: signedIn.staff.id,
        grants: signedIn.grants,
        staff: staffWhoMaySignIn({ staff }),
        requestApproval: (request) => deps.api.requestApproval(credential, token, request),
      }),
      onSessionExpired: () => signOut(vi.errors.API_STAFF_SESSION_INVALID),
      openWalletPayment: (body: WalletPaymentBody) =>
        deps.api.createWalletPayment(credential, token, body),
    };
  }, [signedIn, snapshot, staff, deps, credential, signOut]);

  if (snapshot === null) {
    return withBanner(<BootstrapScreen error={bootstrapError} onRetry={loadBootstrap} />);
  }
  if (signedIn === null || permissions === null) {
    return withBanner(
      <StaffLoginScreen
        branchName={snapshot.branch.name}
        staff={staffWhoMaySignIn({ staff })}
        notice={signInNotice}
        signIn={(staffId, pin) => deps.api.startStaffSession(credential, { staffId, pin })}
        onSignedIn={(staff, session) => {
          signInto(sessions.current, session);
          void deps.api.staffGrants(credential, session.token).then((answer) => {
            setSignInNotice(null);
            setSignedIn({ staff, session, grants: answer.ok ? answer.value : [] });
            till?.sync.nudge();
          });
        }}
      />,
    );
  }
  if (rejected !== null) {
    return withBanner(
      <NeedsAttentionFlow
        client={till?.client ?? null}
        place={place}
        staffId={signedIn.staff.id}
        rejected={rejected}
        onSent={() => till?.sync.nudge()}
        onBack={() => setRejected(null)}
      />,
    );
  }
  return withBanner(
    <TillPermissionsProvider value={permissions}>
      <ServerRestoreNotice restore={status.restore} />
      <TillClockNotice offsetMs={status.clockOffsetMs} />
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
        onSignOut={() => signOut(vi.session.signedOut(signedIn.staff.displayName))}
      />
    </TillPermissionsProvider>,
  );
}
