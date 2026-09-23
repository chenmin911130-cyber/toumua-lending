import { ChevronRight, CircleCheck, ClipboardList, Search } from "lucide-react";
import { CUSTOMER_SELF_APPLY } from "../../features";

const STEPS = [
  {
    num: "01",
    icon: ClipboardList,
    title: CUSTOMER_SELF_APPLY ? "Apply" : "Contact the office",
    description: CUSTOMER_SELF_APPLY
      ? "Apply online with the amount you need and the security you can offer."
      : "Contact our office to apply. A loan officer completes the form with you.",
  },
  {
    num: "02",
    icon: Search,
    title: "We review",
    description: "Our team assesses your application quickly.",
  },
  {
    num: "03",
    icon: CircleCheck,
    title: "Get your decision",
    description: "Receive a response and next steps.",
  },
] as const;

export function ProcessSteps() {
  return (
    <section id="how-it-works" className="bg-white py-16 md:py-20 lg:py-[88px]">
      <div className="marketing-wrap">
        <h2 className="text-left text-[clamp(30px,3.5vw,40px)] font-bold tracking-tight text-text">
          Borrowing made simple
        </h2>
        <p className="mt-3 max-w-[520px] text-left text-[17px] leading-relaxed text-text-secondary">
          A straightforward process from application to approval.
        </p>

        <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, index) => (
            <div key={step.num} className="relative flex items-start gap-4">
              <article className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f3f4f6] text-[13px] font-semibold text-text-muted">
                    {step.num}
                  </span>
                  <step.icon className="h-5 w-5 text-primary" strokeWidth={1.7} aria-hidden />
                </div>
                <h3 className="mt-4 text-[18px] font-semibold text-text">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-text-secondary">
                  {step.description}
                </p>
              </article>
              {index < STEPS.length - 1 ? (
                <ChevronRight
                  className="absolute top-3 -right-4 hidden h-5 w-5 text-text-muted lg:block"
                  strokeWidth={1.8}
                  aria-hidden
                />
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
