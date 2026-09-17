import { useState } from "react";
import type { InputHTMLAttributes } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function PasswordField({ label, error, id, name, ...props }: Props) {
  const [visible, setVisible] = useState(false);
  const inputId = id ?? name;
  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <div className="password-wrap">
        <input
          id={inputId}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={props.autoComplete}
          aria-invalid={Boolean(error)}
          {...props}
        />
        <button
          type="button"
          data-control-id="GLOBAL-23"
          aria-label={visible ? "Hide password" : "Show password"}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
      {error ? <div className="field-error">{error}</div> : null}
    </div>
  );
}
