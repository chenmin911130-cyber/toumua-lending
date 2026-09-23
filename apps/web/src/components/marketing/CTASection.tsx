import { Link } from "react-router-dom";

export function CTASection() {
  return (
    <section className="bg-primary py-16 md:py-20 lg:py-24">
      <div className="mx-auto max-w-[720px] px-6 text-center lg:px-12">
        <h2 className="text-[clamp(28px,3.5vw,38px)] font-bold tracking-tight text-white">
          Ready to explore your options?
        </h2>
        <p className="mx-auto mt-4 max-w-[480px] text-[17px] leading-relaxed text-white/85">
          Start your application or talk with our team.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/login"
            className="inline-flex h-12 items-center justify-center rounded-full bg-white px-6 text-[15px] font-semibold text-primary no-underline transition-all hover:-translate-y-px"
          >
            Get started
          </Link>
          <Link
            to="/help"
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/35 px-6 text-[15px] font-semibold text-white no-underline transition-all hover:-translate-y-px hover:bg-white/10"
          >
            Talk to us
          </Link>
        </div>
      </div>
    </section>
  );
}
