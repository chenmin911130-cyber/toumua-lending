import { Link } from "react-router-dom";
import { ChevronRight, ShieldCheck, Users, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { FeatureItem } from "./FeatureItem";
import { LoanCalculator } from "./LoanCalculator";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0">
        <img
          src="/images/coast.jpg"
          alt=""
          className="h-full w-full object-cover object-[center_40%]"
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-white/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-white/30 via-transparent to-transparent" />
      </div>

      <p
        className="pointer-events-none absolute bottom-[18%] right-[8%] hidden max-w-[280px] rotate-[-6deg] font-[cursive] text-[28px] leading-tight text-white/90 drop-shadow-md lg:block xl:text-[34px]"
        aria-hidden
      >
        People Progress Together
      </p>

      <div className="relative mx-auto grid max-w-[1280px] gap-10 px-6 py-14 lg:grid-cols-[1fr_auto] lg:items-center lg:gap-12 lg:px-12 lg:py-20 xl:py-24">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
        >
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">
            Finance a brighter tomorrow
          </p>
          <h1 className="mt-4 max-w-[560px] text-[clamp(40px,5vw,64px)] font-bold leading-[1.05] tracking-tight text-text">
            Simple finance.
            <br />
            Built around you.
          </h1>
          <p className="mt-5 max-w-[480px] text-[17px] leading-[1.6] text-text-secondary">
            At Toumu&apos;a Lending, we make borrowing simple, transparent and personal — so you
            can move forward with confidence.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/register"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-[10px] bg-primary px-6 text-[15px] font-semibold text-white no-underline transition-all hover:-translate-y-px hover:bg-primary-hover"
              data-control-id="C01-03"
            >
              Check my options
              <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
            <Link
              to="/help"
              className="inline-flex h-12 items-center justify-center rounded-[10px] border border-border bg-white px-6 text-[15px] font-semibold text-text no-underline transition-all hover:-translate-y-px hover:border-text-muted/30"
            >
              Talk to us
            </Link>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-3">
            <FeatureItem icon={Zap} title="Fast decisions" description="Get a response quickly" />
            <FeatureItem
              icon={ShieldCheck}
              title="Transparent terms"
              description="No hidden surprises"
            />
            <FeatureItem
              icon={Users}
              title="Personal support"
              description="A team that cares"
            />
          </div>
        </motion.div>

        <div className="flex justify-center lg:justify-end">
          <LoanCalculator />
        </div>
      </div>
    </section>
  );
}
