"use client";

import { formatVnd, vnd } from "@fnb/domain";
import { type FormEvent, useState } from "react";
import type { SettingEntry } from "../../lib/api/settings-api";
import { parseAmountText } from "../../lib/format/amount-text";
import { vi } from "../../messages/vi";
import { TextField } from "../ui/text-field";
import { SettingCard } from "./setting-card";
import type { SettingWrite } from "./use-setting-write";

const T = vi.settings.tolerance;
export const CLOSE_TOLERANCE_KEY = "shift_close_difference_tolerance";

/** The stored decimal string as đồng, or null when it is not one (shown as it is then). */
const toleranceOf = (value: unknown) =>
  typeof value === "string" && /^\d{1,18}$/.test(value) ? vnd(BigInt(value)) : null;

function CloseToleranceForm({ entry, write }: { entry: SettingEntry; write: SettingWrite }) {
  const current = toleranceOf(entry.value);
  const [text, setText] = useState(() => (current === null ? "" : formatVnd(current).replace(/\s*₫$/u, "")));
  const [invalid, setInvalid] = useState(false);
  const locked = !entry.editableHere || write.busy;

  function submit(event: FormEvent) {
    event.preventDefault();
    const amount = parseAmountText(text);
    setInvalid(amount === null);
    // Money settings travel as decimal strings, so the amount stays exact on the way.
    if (amount !== null) void write.save(CLOSE_TOLERANCE_KEY, amount.toString());
  }

  return (
    <form className="bo-stack" onSubmit={submit} noValidate>
      <p className="bo-muted">{T.current(current === null ? String(entry.value) : formatVnd(current))}</p>
      <TextField
        label={T.label}
        value={text}
        inputMode="numeric"
        disabled={locked}
        error={invalid ? vi.common.amountInvalid : undefined}
        onChange={setText}
      />
      {entry.editableHere && (
        <button type="submit" className="bo-button bo-button--primary" disabled={write.busy}>
          {write.busy ? vi.common.saving : vi.common.save}
        </button>
      )}
    </form>
  );
}

/** How far a counted drawer may be off before closing the shift needs an approver. */
export function CloseToleranceSection({ entry, write }: { entry: SettingEntry; write: SettingWrite }) {
  return (
    <SettingCard title={T.title} hint={T.hint} entry={entry} write={write}>
      <CloseToleranceForm key={`${entry.source}:${JSON.stringify(entry.value)}`} entry={entry} write={write} />
    </SettingCard>
  );
}
