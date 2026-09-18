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
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      {children ?? <input id={inputId} aria-invalid={Boolean(error)} {...props} />}
      {hint ? <div className="hint">{hint}</div> : null}
      {error ? <div className="field-error">{error}</div> : null}
    </div>
  );
}
