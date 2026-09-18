import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Testimonials } from "./Testimonials";

export function WhyUs() {
  return (
    <section id="why" className="bg-[#f4f7f4] py-16 md:py-20 lg:py-[88px]">
      <div className="marketing-wrap">
        <div className="max-w-[560px]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-primary">
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
            to="/about"
            className="mt-8 inline-flex h-11 items-center gap-1 rounded-full border border-border bg-white px-5 text-[15px] font-semibold text-text no-underline transition-all hover:-translate-y-px"
          >
            About us
            <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
          </Link>
        </div>
        <div className="mt-10">
          <Testimonials />
        </div>
      </div>
    </section>
  );
}
