import type { LocalStore } from "@fnb/sync-client";
import { useEffect, useState } from "react";
import { vi } from "../messages/vi";
import { type BlockReason, BlockedScreen } from "../screens/blocked/blocked-screen";
import { PairDeviceScreen } from "../screens/pair-device/pair-device-screen";
import { ScreenFrame } from "../screens/shared/screen-frame";
import type { DeviceCredential } from "../shell-bridge/device-credential-store";
import { PairedTill } from "./paired-till";
import { type PosDependencies, blockReasonOf } from "./pos-dependencies";

type Phase =
  | { readonly kind: "opening" }
  | { readonly kind: "blocked"; readonly reason: BlockReason }
  | { readonly kind: "pairing"; readonly store: LocalStore }
  | { readonly kind: "paired"; readonly store: LocalStore; readonly credential: DeviceCredential };

/** The POS: the till's database first (one tab only), then pairing, then the paired till. */
export function PosApp({ deps }: { deps: PosDependencies }) {
  const [phase, setPhase] = useState<Phase>({ kind: "opening" });
  useEffect(() => {
    let live = true;
    deps.store.then(
      async (store) => {
        const credential = await deps.credentials.load().catch(() => null);
        if (!live) return;
        setPhase(
          credential === null ? { kind: "pairing", store } : { kind: "paired", store, credential },
        );
      },
      (error: unknown) => {
        if (live) setPhase({ kind: "blocked", reason: blockReasonOf(error) });
      },
    );
    return () => {
      live = false;
    };
  }, [deps]);

  switch (phase.kind) {
    case "opening":
      return (
        <ScreenFrame title={vi.boot.opening}>
          <div className="pos-spinner" aria-hidden="true" />
        </ScreenFrame>
      );
    case "blocked":
      return <BlockedScreen reason={phase.reason} onReload={deps.reload} />;
    case "pairing":
      return (
        <PairDeviceScreen
          pair={(input) => deps.api.pairDevice(input)}
          linkedCode={deps.linkedPairingCode ?? null}
          onPaired={async (credential) => {
            await deps.credentials.save(credential);
            setPhase({ kind: "paired", store: phase.store, credential });
          }}
        />
      );
    case "paired":
      return <PairedTill deps={deps} store={phase.store} credential={phase.credential} />;
  }
}
