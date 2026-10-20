"use client";

import { useMemo } from "react";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { PageHeader } from "../shell/page-header";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { DevicesTable } from "./devices-table";
import { PairingCodePanel } from "./pairing-code-panel";

const T = vi.devices;

export function DevicesScreen() {
  const api = useApi();
  const { branch } = useSession();
  const branchId = branch?.id ?? null;
  const load = useMemo(
    () => (branchId === null ? null : () => api.listDevices(branchId)),
    [api, branchId],
  );
  const [loaded, reload, refresh] = useApiLoad(load);

  return (
    <section className="bo-stack" aria-labelledby="devices-title">
      <PageHeader section="/devices" title={T.title} titleId="devices-title" hint={T.hint} />
      {branchId === null ? (
        <p className="bo-muted">{T.chooseBranch}</p>
      ) : (
        <>
          <PairingCodePanel key={branchId} branchId={branchId} onTick={refresh} />
          <LoadStateView loaded={loaded} retry={reload}>
            {(devices) => <DevicesTable devices={devices} onChanged={refresh} />}
          </LoadStateView>
        </>
      )}
    </section>
  );
}
