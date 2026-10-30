"use client";

import {
  type InputHTMLAttributes,
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/**
 * True once the step around some fields was asked to go ahead (a confirm's button), for
 * fields that are not inside a <form> of their own: their errors show from then on.
 */
export const FieldAttemptContext = createContext(false);

/**
 * When a field's error is shown: never while the person has not done anything with it yet,
 * only once they typed and left it, or once its form was sent (or the step around it was
 * asked to go ahead). The form clearing the field after it was saved starts it over.
 */
export function useShownError(error: string | undefined, value: string, commitsOnChange = false) {
  const input = useRef<HTMLInputElement>(null);
  const typed = useRef<string | null>(null);
  const [left, setLeft] = useState(false);
  const [sent, setSent] = useState(false);
  const stepAttempted = useContext(FieldAttemptContext);

  // Attached as the field is put on the page, not a moment after: a form sent in that moment
  // (a screen that renders it the instant its data arrives, then is clicked at once) would be
  // refused with no error shown, because nothing yet heard it was sent.
  useLayoutEffect(() => {
    const form = input.current?.form;
    if (form === null || form === undefined) return;
    const onSubmit = () => setSent(true);
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);

  // Emptied by the page, not by the person (the form saved and starts again): fresh.
  useEffect(() => {
    if (value === "" && typed.current !== null && typed.current !== "") {
      typed.current = null;
      setLeft(false);
      setSent(false);
    }
  }, [value]);

  const shown = error !== undefined && (left || sent || stepAttempted) ? error : undefined;
  return {
    input,
    shown,
    onTyped: (next: string) => {
      typed.current = next;
      // A date is not typed letter by letter: picking one is the person's whole answer.
      if (commitsOnChange) setLeft(true);
    },
    onLeft: () => {
      if (typed.current !== null) setLeft(true);
    },
  };
}

/**
 * A row of fields with the button that sends them: the button stands level with the boxes,
 * not with the error under a box, so an error appearing never moves it.
 */
export function FieldRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`bo-field-row ${className ?? ""}`}>{children}</div>;
}

/**
 * The one field of the backoffice: a label, the input, a hint and an error under it, tied to
 * it for screen readers. The error sits outside the label, so the field keeps its name when
 * the error appears, and it shows only once the person has done something with the field
 * (useShownError): a field nobody touched is never red.
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
  const { input: inputRef, shown, onTyped, onLeft } = useShownError(error, value, input.type === "date");
  const described = [shown === undefined ? null : errorId, hint === undefined ? null : hintId]
    .filter((id) => id !== null)
    .join(" ");
  return (
    <div className={`bo-field ${className ?? ""}`}>
      <label htmlFor={inputId}>{label}</label>
      <input
        {...input}
        ref={inputRef}
        id={inputId}
        className="bo-input"
        value={value}
        aria-invalid={shown === undefined ? undefined : true}
        aria-describedby={described === "" ? undefined : described}
        onChange={(event) => {
          onTyped(event.target.value);
          onChange(event.target.value);
        }}
        onBlur={(event) => {
          onLeft();
          input.onBlur?.(event);
        }}
      />
      {hint !== undefined && (
        <span id={hintId} className="bo-muted">
          {hint}
        </span>
      )}
      <FieldError id={errorId} message={shown} />
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
