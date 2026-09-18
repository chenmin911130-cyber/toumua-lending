import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Testimonials } from "./Testimonials";

export function WhyUs() {
  return (
    <section className="bg-bg-green py-16 md:py-24 lg:py-[96px]">
      <div className="mx-auto grid max-w-[1280px] gap-12 px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-start lg:gap-16 lg:px-12">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">
            Why Toumu&apos;a
          </p>
          <h2 className="mt-4 text-[clamp(30px,3.5vw,40px)] font-bold leading-[1.12] tracking-tight text-text">
            More than lending.
            <br />
            We&apos;re with you.
          </h2>
          <p className="mt-5 max-w-[440px] text-[17px] leading-[1.65] text-text-secondary">
            We believe finance should be simple, fair and human. Our team is here to support your
            goals, not just process your application.
          </p>
          <Link
            to="/help"
            className="mt-8 inline-flex items-center gap-1 text-[15px] font-semibold text-primary no-underline hover:text-primary-hover"
          >
            About us
            <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          </Link>
        </div>
        <Testimonials />
      </div>
    </section>
  );
}
