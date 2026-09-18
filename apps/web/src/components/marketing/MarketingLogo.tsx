import { Link } from "react-router-dom";

type Props = {
  to?: string;
  className?: string;
};

export function MarketingLogo({ to = "/", className = "" }: Props) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center gap-2.5 no-underline ${className}`}
      data-control-id="GLOBAL-01"
    >
      <svg
        viewBox="0 0 36 36"
        className="h-8 w-8 text-text"
        fill="none"
        aria-hidden
      >
        <path
          d="M4 26.5 16.2 8.5l6.1 8.6L32 10.8"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="text-[18px] font-semibold tracking-tight text-text">Toumu&apos;a</span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-text-muted">
          Lending
        </span>
      </span>
    </Link>
  );
}
