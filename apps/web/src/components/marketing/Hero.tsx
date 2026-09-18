import { Link } from "react-router-dom";
import { ChevronRight, ShieldCheck, Users, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { FeatureItem } from "./FeatureItem";
import { LoanCalculator } from "./LoanCalculator";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-white">
      <div className="absolute inset-0">
        <img
          src="/images/hero-lake.jpg"
          alt=""
          className="h-full w-full object-cover object-[62%_42%]"
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white from-[18%] via-white/80 via-[38%] to-transparent to-[58%]" />
      </div>

      <p
        className="pointer-events-none absolute top-[20%] left-[46%] hidden max-w-[220px] rotate-[-8deg] font-[Caveat,cursive] text-[30px] leading-[1.15] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.25)] xl:block xl:text-[34px]"
        aria-hidden
      >
        People
        <br />
        Progress
        <br />
        Together
      </p>

      <div className="marketing-wrap relative z-10 flex flex-col gap-10 py-12 lg:flex-row lg:items-center lg:justify-between lg:gap-16 lg:py-16 xl:py-20">
        <motion.div
          className="max-w-[620px] shrink-0"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-primary">
            Finance a brighter tomorrow
          </p>
          <h1 className="mt-4 max-w-[620px] text-[clamp(42px,5.4vw,68px)] font-bold leading-[1.02] tracking-[-0.03em] text-text">
            Simple finance.
            <br />
            Built around you.
          </h1>
          <p className="mt-5 max-w-[500px] text-[17px] leading-[1.65] text-text-secondary">
            At Toumu&apos;a Lending, we make borrowing simple, transparent and personal — so you
            can move forward with confidence.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/register"
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
            <FeatureItem icon={Zap} title="Fast decisions" description="Get a response quickly" />
            <FeatureItem
              icon={ShieldCheck}
              title="Transparent terms"
              description="No hidden fees"
            />
            <FeatureItem
              icon={Users}
              title="Personal support"
              description="A team that cares"
            />
          </div>
        </motion.div>

        <div className="flex w-full justify-center lg:w-auto lg:shrink-0 lg:justify-end">
          <LoanCalculator />
        </div>
      </div>
    </section>
  );
}
