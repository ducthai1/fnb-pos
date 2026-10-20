"use client";

import { useState } from "react";
import type { ApiFailure, ApiResult } from "../../lib/api/api-result";
import type { SettingsScope, SettingsView } from "../../lib/api/settings-api";
import { isSignedOut } from "../../lib/errors/failure-message";
import { useApi } from "../app/api-context";
import { useSession } from "../shell/session-context";

export interface SettingWrite {
  readonly busy: boolean;
  /** Why the last write was refused, for the section that made it to show; null otherwise. */
  readonly failure: ApiFailure | null;
  /** The key the last successful write was about, for a "saved" line next to it. */
  readonly savedKey: string | null;
  save(key: string, value: unknown): Promise<boolean>;
  /** Removes the layer's own value: the key inherits from the layer above again. */
  clear(key: string): Promise<boolean>;
}

/**
 * Writes of one section of the settings page at one scope. Each section has its own, so a
 * refusal shows in the section whose form caused it. The server answers every write with
 * the scope's settings as they now resolve, and the page shows that answer.
 */
export function useSettingWrite(scope: SettingsScope, onView: (view: SettingsView) => void): SettingWrite {
  const api = useApi();
  const { signedOut } = useSession();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);

  async function run(key: string, write: () => Promise<ApiResult<SettingsView>>) {
    setBusy(true);
    setFailure(null);
    setSavedKey(null);
    const result = await write();
    setBusy(false);
    if (!result.ok) {
      if (isSignedOut(result)) signedOut();
      setFailure(result);
      return false;
    }
    setSavedKey(key);
    onView(result.value);
    return true;
  }

  return {
    busy,
    failure,
    savedKey,
    save: (key, value) => run(key, () => api.putSetting(scope, key, value)),
    clear: (key) => run(key, () => api.clearSetting(scope, key)),
  };
}
