"use client";

import { useId, useState } from "react";
import type { SettingEntry, SettingsScope, SettingsView } from "../../lib/api/settings-api";
import { isSignedOut } from "../../lib/errors/failure-message";
import { type PlaceNames, settingLabel, switchRefusalMessage } from "../../lib/settings/switch-refusal-message";
import { vi } from "../../messages/vi";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";
import { FieldError } from "../ui/text-field";
import { SettingSourceLine } from "./setting-card";

const T = vi.settings;

interface Refusal {
  readonly key: string;
  readonly message: string;
}

function SwitchRow({
  entry,
  busy,
  refusal,
  onWrite,
}: {
  entry: SettingEntry;
  busy: boolean;
  refusal: string | undefined;
  onWrite: (value: boolean | null) => void;
}) {
  const inputId = useId();
  const errorId = useId();
  return (
    <li className="bo-switch" data-setting-key={entry.key} data-refused={refusal === undefined ? undefined : true}>
      <label htmlFor={inputId} className="bo-field--inline bo-wrap">
        <input
          id={inputId}
          type="checkbox"
          checked={entry.value === true}
          disabled={busy || !entry.editableHere}
          aria-invalid={refusal === undefined ? undefined : true}
          aria-describedby={refusal === undefined ? undefined : errorId}
          onChange={(event) => onWrite(event.target.checked)}
        />
        {settingLabel(entry.key)}
      </label>
      <SettingSourceLine entry={entry} busy={busy} onClear={() => onWrite(null)} />
      <FieldError id={errorId} message={refusal} />
    </li>
  );
}

/**
 * The on/off switches at the scope: each writes on its own, and a write the server refuses
 * (a switch that needs another, two that exclude each other) is explained under the very
 * switch that was changed, naming the other one.
 */
export function FeatureSwitches({
  entries,
  scope,
  names,
  onView,
}: {
  entries: readonly SettingEntry[];
  scope: SettingsScope;
  names: PlaceNames;
  onView: (view: SettingsView) => void;
}) {
  const api = useApi();
  const { signedOut } = useSession();
  const titleId = useId();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  async function write(key: string, value: boolean | null) {
    setBusyKey(key);
    setRefusal(null);
    const result = value === null ? await api.clearSetting(scope, key) : await api.putSetting(scope, key, value);
    setBusyKey(null);
    if (result.ok) return onView(result.value);
    if (isSignedOut(result)) signedOut();
    setRefusal({ key, message: switchRefusalMessage(result, scope, names) });
  }

  return (
    <section className="bo-card" aria-labelledby={titleId}>
      <h2 id={titleId} className="bo-subtitle">
        {T.switchesTitle}
      </h2>
      <ul className="bo-switch-list">
        {entries.map((entry) => (
          <SwitchRow
            key={entry.key}
            entry={entry}
            busy={busyKey !== null}
            refusal={refusal?.key === entry.key ? refusal.message : undefined}
            onWrite={(value) => void write(entry.key, value)}
          />
        ))}
      </ul>
    </section>
  );
}
