import { useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ShieldCheck, Users, Zap } from "lucide-react";
import { FeatureItem } from "./FeatureItem";
import { CUSTOMER_SELF_APPLY } from "../../features";
import { LoanCalculator } from "./LoanCalculator";

export function Hero() {
  const heroRef = useRef<HTMLElement>(null);

  return (
    <section ref={heroRef} className="relative overflow-hidden bg-white">
      <div className="relative min-h-[560px] overflow-hidden lg:min-h-[720px]">
        <div className="pointer-events-none absolute inset-0">
          <img
            src="/images/hero-house.jpg"
            width={1536}
            height={1024}
            alt=""
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover object-[68%_42%]"
            aria-hidden
          />
          <div className="absolute inset-y-0 left-0 w-[min(48%,760px)] bg-gradient-to-r from-white/55 via-white/20 to-transparent" />
        </div>

        <p
          className="pointer-events-none absolute top-[18%] left-[42%] hidden max-w-[260px] rotate-[-7deg] font-[Caveat,cursive] text-[28px] leading-[1.15] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.22)] xl:block xl:text-[32px]"
          aria-hidden
        >
          Finance today
          <br />
          for a brighter
          <br />
          tomorrow
        </p>
        <div className="marketing-wrap relative z-10 py-12 pb-8 lg:py-16 xl:py-20">
          <div className="max-w-[680px]">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-primary">
              Real opportunities. A brighter tomorrow.
            </p>
            <h1 className="mt-4 max-w-[650px] text-[clamp(42px,5.4vw,68px)] font-bold leading-[1.02] tracking-[-0.03em] text-text">
              Simple finance.
              <br />
              Built around you.
            </h1>
            <p className="mt-5 max-w-[580px] text-[17px] leading-[1.65] text-text-secondary">
              Secured loans for personal, vehicle and business needs.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/login"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-white no-underline transition-all hover:-translate-y-px hover:bg-primary-hover"
                data-control-id="C01-03"
              >
                Check my options
                <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
              </Link>
              <Link
                to="/help"
                className="inline-flex h-12 items-center justify-center rounded-full border border-border bg-white px-6 text-[15px] font-semibold text-text no-underline transition-all hover:-translate-y-px hover:border-text-muted/30"
              >
                Talk to us
              </Link>
            </div>

            <div className="mt-10 grid gap-5 sm:grid-cols-3">
              <FeatureItem icon={Zap} title="Clear process" description={CUSTOMER_SELF_APPLY ? "Apply, review, decide" : "Contact the office to apply"} />
              <FeatureItem
                icon={ShieldCheck}
                title="Fees on the offer"
                description="Estimates exclude fees"
              />
              <FeatureItem icon={Users} title="Office support" description="Talk with the team" />
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-20 bg-white px-6 py-6 xl:contents">
        <LoanCalculator boundsRef={heroRef} />
      </div>
    </section>
  );
}
