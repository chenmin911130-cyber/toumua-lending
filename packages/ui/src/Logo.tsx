import { Link } from "react-router-dom";

type MarkProps = {
  light?: boolean;
  className?: string;
};

export function BrandMark({ light, className = "" }: MarkProps) {
  const tile = light ? "rgba(255,255,255,0.18)" : "#075E45";
  const ink = "#ffffff";

  return (
    <svg viewBox="0 0 36 36" className={className || "brand-mark"} aria-hidden>
      <circle cx="18" cy="18" r="18" fill={tile} />
      <path fill={ink} d="M10.6 22.2V16.7L18 10.2l4.2 3.7V10.4h2.4v6.3l.8.7v4.8H10.6Z" />
      <path
        d="M7 25.3c3.4-2.4 6.5 2 10.6-.5 4-2.4 6.8 2.2 11.3-.2"
        fill="none"
        stroke={ink}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

type LogoProps = {
  to: string;
  light?: boolean;
  className?: string;
  subtitle?: string;
};

export function Logo({ to, light, className = "", subtitle = "Lending" }: LogoProps) {
  return (
    <Link
      to={to}
      className={`brand-logo${light ? " brand-logo-light" : ""} ${className}`.trim()}
      data-control-id="GLOBAL-01"
    >
      <BrandMark light={light} />
      <span className="brand-wordmark">
        <span className="brand-name">Toumu&apos;a</span>
        {subtitle ? <span className="brand-sub">{subtitle}</span> : null}
      </span>
    </Link>
  );
}
