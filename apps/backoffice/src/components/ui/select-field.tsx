"use client";

import { useId } from "react";
import { FieldError } from "./text-field";

export interface SelectChoice {
  readonly value: string;
  readonly label: string;
}

/** A labelled select with its error under it, outside the label like TextField's. */
export function SelectField({
  label,
  value,
  choices,
  onChange,
  error,
}: {
  label: string;
  value: string;
  choices: readonly SelectChoice[];
  onChange: (value: string) => void;
  error?: string | undefined;
}) {
  const id = useId();
  return (
    <div className="bo-field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="bo-input"
        value={value}
        aria-invalid={error === undefined ? undefined : true}
        onChange={(event) => onChange(event.target.value)}
      >
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </div>
  );
}

/** A checkbox with its label beside it. */
export function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="bo-field--inline bo-wrap">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
