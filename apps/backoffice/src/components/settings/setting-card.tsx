"use client";

import { type ReactNode, useId } from "react";
import type { SettingEntry } from "../../lib/api/settings-api";
import { failureMessage } from "../../lib/errors/failure-message";
import { vi } from "../../messages/vi";
import { ErrorNotice, SuccessNotice } from "../ui/error-notice";
import type { SettingWrite } from "./use-setting-write";

const T = vi.settings;

/** Where an entry's value comes from, and the way back to inheriting it. */
export function SettingSourceLine({
  entry,
  busy,
  onClear,
}: {
  entry: SettingEntry;
  busy: boolean;
  onClear: () => void;
}) {
  return (
    <div className="bo-row bo-setting-source">
      <span className="bo-muted" data-setting-source={entry.setHere ? "here" : entry.source}>
        {entry.setHere ? T.setHere : (T.source[entry.source] ?? entry.source)}
      </span>
      {!entry.editableHere && <span className="bo-muted">{T.notEditableHere}</span>}
      {entry.editableHere && entry.setHere && (
        <button type="button" className="bo-link-button" disabled={busy} onClick={onClear}>
          {T.useInherited}
        </button>
      )}
    </div>
  );
}

/**
 * One setting's card: its title and hint, where its value comes from, its form, and the
 * outcome of the last write made from it, so a refusal sits under the form that caused it.
 */
export function SettingCard({
  title,
  hint,
  entry,
  write,
  children,
}: {
  title: string;
  hint?: string;
  entry: SettingEntry;
  write: SettingWrite;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className="bo-card" aria-labelledby={titleId} data-setting-key={entry.key}>
      <h2 id={titleId} className="bo-subtitle">
        {title}
      </h2>
      {hint !== undefined && <p className="bo-muted bo-wrap">{hint}</p>}
      <SettingSourceLine entry={entry} busy={write.busy} onClear={() => void write.clear(entry.key)} />
      {children}
      <ErrorNotice message={write.failure === null ? null : failureMessage(write.failure)} />
      <SuccessNotice message={write.savedKey === entry.key ? vi.common.saved : null} />
    </section>
  );
}
