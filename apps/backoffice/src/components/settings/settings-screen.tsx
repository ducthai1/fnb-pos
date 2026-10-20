"use client";

import { useCallback, useMemo, useState } from "react";
import type { Branch } from "../../lib/api/branch-api";
import type { ConfigScopeKind, SettingsScope, SettingsView } from "../../lib/api/settings-api";
import type { PlaceNames } from "../../lib/settings/switch-refusal-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { LoadStateView } from "../shell/load-state-view";
import { useSession } from "../shell/session-context";
import { useApiLoad } from "../shell/use-api-load";
import { SettingsScopePicker } from "./settings-scope-picker";
import { SettingsSections } from "./settings-sections";

const T = vi.settings;

function scopeOf(layer: ConfigScopeKind, branch: Branch, deviceId: string): SettingsScope | null {
  if (layer === "brand") return { kind: "brand", id: branch.brandId };
  if (layer === "branch") return { kind: "branch", id: branch.id };
  return deviceId === "" ? null : { kind: "device", id: deviceId };
}

const sameScope = (a: SettingsScope, b: SettingsScope) => a.kind === b.kind && a.id === b.id;

function BranchSettings({ branch }: { branch: Branch }) {
  const api = useApi();
  const { branches } = useSession();
  const [layer, setLayer] = useState<ConfigScopeKind>("branch");
  const [deviceId, setDeviceId] = useState("");
  // What the server answered the last write with; it replaces the loaded view of that scope.
  const [written, setWritten] = useState<SettingsView | null>(null);

  const loadDevices = useMemo(
    () => (layer === "device" ? () => api.listDevices(branch.id) : null),
    [api, layer, branch.id],
  );
  const [devices] = useApiLoad(loadDevices);
  const scope = useMemo(() => scopeOf(layer, branch, deviceId), [layer, branch, deviceId]);
  const load = useMemo(() => (scope === null ? null : () => api.getSettings(scope)), [api, scope]);
  const [loaded, reload] = useApiLoad(load);

  const names = useCallback<PlaceNames>(
    (kind, id) => {
      if (kind === "branch") return branches?.find((each) => each.id === id)?.name ?? null;
      if (kind === "device" && devices.state === "ready") {
        return devices.value.find((each) => each.id === id)?.name ?? null;
      }
      return null;
    },
    [branches, devices],
  );

  return (
    <>
      <SettingsScopePicker
        branch={branch}
        layer={layer}
        onLayer={(next) => {
          setWritten(null);
          setLayer(next);
        }}
        devices={devices}
        deviceId={deviceId}
        onDevice={(next) => {
          setWritten(null);
          setDeviceId(next);
        }}
      />
      {scope !== null && (
        <LoadStateView loaded={loaded} retry={reload}>
          {(view) => (
            <SettingsSections
              key={`${scope.kind}:${scope.id}`}
              scope={scope}
              view={written !== null && sameScope(written.scope, scope) ? written : view}
              names={names}
              onView={setWritten}
            />
          )}
        </LoadStateView>
      )}
    </>
  );
}

/** The switches and settings of the branch being looked at, its brand, or one of its tills. */
export function SettingsScreen() {
  const { branch } = useSession();
  return (
    <section className="bo-stack" aria-labelledby="settings-title">
      <h1 id="settings-title" className="bo-title">
        {T.title}
      </h1>
      <p className="bo-muted bo-wrap">{T.hint}</p>
      {branch === null ? (
        <p className="bo-muted">{vi.devices.chooseBranch}</p>
      ) : (
        <BranchSettings key={branch.id} branch={branch} />
      )}
    </section>
  );
}
