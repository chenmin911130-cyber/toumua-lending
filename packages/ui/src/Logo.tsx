import { Link } from "react-router-dom";

type MarkProps = {
  light?: boolean;
  className?: string;
};

export function BrandMark({ light, className = "" }: MarkProps) {
  const tile = light ? "rgba(255,255,255,0.16)" : "#075E45";
  const ink = "#ffffff";
  const cut = light ? "rgba(16,24,40,0.22)" : "#075E45";

  return (
    <svg viewBox="0 0 36 36" className={className || "brand-mark"} aria-hidden>
      <rect width="36" height="36" rx="10" fill={tile} />
      <path d="M7.2 15.1c0-.7.6-1.3 1.3-1.3h19c.7 0 1.3.6 1.3 1.3v1.2H7.2z" fill={ink} />
      <path d="M11.1 16.3h13.8v9.3a1.7 1.7 0 0 1-1.7 1.7H12.8a1.7 1.7 0 0 1-1.7-1.7z" fill={ink} />
      <rect x="13.6" y="18.4" width="3.5" height="3.5" rx="0.7" fill={cut} />
      <path d="M20.3 21.6h3.3v5.7h-3.3z" fill={cut} />
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
