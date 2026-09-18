import { BriefcaseBusiness, Car, ChevronRight, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { LoanCard } from "./LoanCard";

const PRODUCTS = [
  {
    icon: Car,
    title: "Vehicle Finance",
    description: "Get on the road with flexible vehicle finance for new or used vehicles.",
    href: "/help",
  },
  {
    icon: UserRound,
    title: "Personal Loan",
    description:
      "Finance what matters to you — home improvements, travel, or life's next step.",
    href: "/help",
  },
  {
    icon: BriefcaseBusiness,
    title: "Business Finance",
    description: "Support your business goals with flexible lending solutions.",
    href: "/help",
  },
] as const;

export function LoanOptions() {
  return (
    <section className="bg-bg-warm py-16 md:py-24 lg:py-[96px]">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-[clamp(30px,3.5vw,40px)] font-bold tracking-tight text-text">
            Our loan options
          </h2>
          <Link
            to="/help"
            className="inline-flex items-center gap-1 text-[15px] font-semibold text-primary no-underline hover:text-primary-hover"
          >
            View all loans
            <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          </Link>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((product) => (
            <LoanCard key={product.title} {...product} />
          ))}
        </div>
      </div>
    </section>
  );
}
