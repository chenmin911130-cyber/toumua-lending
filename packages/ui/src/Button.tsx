import type { ButtonHTMLAttributes, ReactNode } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
  controlId?: string;
  children: ReactNode;
};

export function Button({
  variant = "primary",
  controlId,
  className = "",
  children,
  ...props
}: Props) {
  return (
    <button
      className={`btn btn-${variant} ${className}`}
      data-control-id={controlId}
      {...props}
    >
      {children}
    </button>
  );
}
