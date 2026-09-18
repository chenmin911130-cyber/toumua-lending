import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

type Props = {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
};

export function LoanCard({ icon: Icon, title, description, href }: Props) {
  return (
    <Link
      to={href}
      className="group block rounded-[18px] bg-[#f6f7f6] p-6 no-underline transition-all duration-200 hover:-translate-y-[3px] hover:bg-[#f1f3f1]"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-primary">
        <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
      </span>
      <h3 className="mt-5 text-[19px] font-semibold text-text">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">{description}</p>
      <span className="mt-5 inline-flex items-center gap-1 text-[15px] font-semibold text-primary transition-colors group-hover:text-primary-hover">
        Learn more
        <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
    </Link>
  );
}
