import type { InputHTMLAttributes, ReactNode } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: ReactNode;
  /**
   * When children are supplied the field renders them instead of a bare input,
   * so selects, textareas and file inputs get the same label and error styling.
   */
  children?: ReactNode;
};

export function Field({ label, error, hint, id, children, ...props }: Props) {
  const inputId = id ?? props.name;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      {children ?? (
        <input
          {...props}
          id={inputId}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
      )}
      {hint ? (
        <div id={hintId} className="hint">
          {hint}
        </div>
      ) : null}
      {error ? (
        <div id={errorId} className="field-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
