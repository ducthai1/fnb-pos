import type { HTMLAttributes } from "react";

/** One field of the buyer form, with what is wrong with it under it. */
export function BuyerTextField({
  label,
  name,
  value,
  problem,
  inputMode = "text",
  maxLength,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  problem: string | null;
  inputMode?: HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength: number;
  onChange(value: string): void;
}) {
  const problemId = `${name}-problem`;
  return (
    // The problem sits outside the label, so the field is still named by its label alone.
    <div className="pos-field">
      <label className="pos-field__label" htmlFor={name}>
        {label}
      </label>
      <input
        id={name}
        className="pos-input"
        name={name}
        value={value}
        inputMode={inputMode}
        maxLength={maxLength}
        autoComplete="off"
        spellCheck={false}
        aria-invalid={problem !== null}
        aria-describedby={problem === null ? undefined : problemId}
        onChange={(event) => onChange(event.target.value)}
      />
      {problem === null ? null : (
        <span className="pos-field__problem" id={problemId}>
          {problem}
        </span>
      )}
    </div>
  );
}
