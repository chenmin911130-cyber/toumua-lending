import { Link } from "react-router-dom";
import { Mountain } from "lucide-react";

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
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-white">
        <Mountain className="h-5 w-5" strokeWidth={2} aria-hidden />
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-[17px] font-bold tracking-tight text-text">Toumu&apos;a</span>
        <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          Lending
        </span>
      </span>
    </Link>
  );
}
