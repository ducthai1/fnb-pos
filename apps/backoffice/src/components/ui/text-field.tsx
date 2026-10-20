"use client";

import { type InputHTMLAttributes, useId } from "react";

/**
 * A labelled input with its hint and error under it, tied to it for screen readers. The
 * error sits outside the label, so the field keeps its name when the error appears.
 */
export function TextField({
  label,
  value,
  onChange,
  error,
  hint,
  className,
  ...input
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: string | undefined;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className" | "id">) {
  const inputId = useId();
  const errorId = useId();
  const hintId = useId();
  const described = [error === undefined ? null : errorId, hint === undefined ? null : hintId]
    .filter((id) => id !== null)
    .join(" ");
  return (
    <div className={`bo-field ${className ?? ""}`}>
      <label htmlFor={inputId}>{label}</label>
      <input
        {...input}
        id={inputId}
        className="bo-input"
        value={value}
        aria-invalid={error === undefined ? undefined : true}
        aria-describedby={described === "" ? undefined : described}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint !== undefined && (
        <span id={hintId} className="bo-muted">
          {hint}
        </span>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

/** The sentence under a field (or a group of fields) that is not right yet. */
export function FieldError({ id, message }: { id?: string; message: string | undefined }) {
  if (message === undefined) return null;
  return (
    <span {...(id === undefined ? {} : { id })} className="bo-field__error" role="alert">
      {message}
    </span>
  );
}
