"use client";

import type { ConfigScopeKind } from "../../lib/api/settings-api";
import type { Branch } from "../../lib/api/branch-api";
import type { Device } from "../../lib/api/devices-api";
import { vi } from "../../messages/vi";
import type { Loaded } from "../shell/use-api-load";
import { SelectField } from "../ui/select-field";

const T = vi.settings;
const LAYERS: readonly ConfigScopeKind[] = ["brand", "branch", "device"];

function layerLabel(layer: ConfigScopeKind, branch: Branch): string {
  if (layer === "brand") return T.layer.brand(branch.brandName);
  if (layer === "branch") return T.layer.branch(branch.name);
  return T.layer.device;
}

function DeviceChoice({
  devices,
  deviceId,
  onDevice,
}: {
  devices: Loaded<readonly Device[]>;
  deviceId: string;
  onDevice: (deviceId: string) => void;
}) {
  if (devices.state === "loading") return <p className="bo-muted">{vi.common.loading}</p>;
  if (devices.state === "denied") return <p className="bo-muted">{T.devicesDenied}</p>;
  if (devices.state === "failed") return <p className="bo-notice bo-notice--error bo-wrap">{devices.message}</p>;
  const inUse = devices.value.filter((device) => device.revokedAt === null);
  if (inUse.length === 0) return <p className="bo-muted">{T.noDevices}</p>;
  return (
    <SelectField
      label={T.deviceLabel}
      value={deviceId}
      choices={[
        { value: "", label: T.chooseDevice },
        ...inUse.map((device) => ({ value: device.id, label: device.name })),
      ]}
      onChange={onDevice}
    />
  );
}

/** Which layer the page shows and edits: the branch's brand, the branch, or one of its tills. */
export function SettingsScopePicker({
  branch,
  layer,
  onLayer,
  devices,
  deviceId,
  onDevice,
}: {
  branch: Branch;
  layer: ConfigScopeKind;
  onLayer: (layer: ConfigScopeKind) => void;
  devices: Loaded<readonly Device[]>;
  deviceId: string;
  onDevice: (deviceId: string) => void;
}) {
  return (
    <div className="bo-card">
      <fieldset className="bo-fieldset">
        <legend>{T.layerLegend}</legend>
        {LAYERS.map((each) => (
          <label key={each} className="bo-field--inline bo-wrap">
            <input type="radio" name="settings-layer" checked={layer === each} onChange={() => onLayer(each)} />
            {layerLabel(each, branch)}
          </label>
        ))}
      </fieldset>
      {layer === "device" && <DeviceChoice devices={devices} deviceId={deviceId} onDevice={onDevice} />}
    </div>
  );
}
