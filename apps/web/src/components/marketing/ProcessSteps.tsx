import { ChevronRight, CircleCheck, Lock, Search } from "lucide-react";
import { motion } from "framer-motion";

const STEPS = [
  {
    num: "01",
    icon: Lock,
    title: "Apply",
    description: "Complete a simple online application.",
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
    <section id="how-it-works" className="bg-white py-16 md:py-24 lg:py-[96px]">
      <div className="mx-auto max-w-[1280px] px-6 lg:px-12">
        <div className="mx-auto max-w-[640px] text-center">
          <h2 className="text-[clamp(30px,3.5vw,40px)] font-bold tracking-tight text-text">
            Borrowing made simple
          </h2>
          <p className="mt-3 text-[17px] leading-relaxed text-text-secondary">
            A straightforward process from application to approval.
          </p>
        </div>

        <div className="mt-14 flex flex-col items-stretch gap-8 md:flex-row md:items-start md:justify-center md:gap-3 lg:gap-6">
          {STEPS.map((step, index) => (
            <div key={step.num} className="flex flex-col items-center gap-8 md:flex-row md:gap-3 lg:gap-6">
              <motion.article
                className="w-full max-w-[280px] rounded-[14px] p-2 text-center md:p-4"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
              >
                <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-bg-green text-[13px] font-semibold tracking-wide text-text-muted">
                  {step.num}
                </span>
                <span className="mx-auto mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-bg-green-icon text-primary">
                  <step.icon className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                </span>
                <h3 className="mt-4 text-[18px] font-semibold text-text">{step.title}</h3>
                <p className="mx-auto mt-2 max-w-[240px] text-[15px] leading-relaxed text-text-secondary">
                  {step.description}
                </p>
              </motion.article>
              {index < STEPS.length - 1 ? (
                <div className="hidden shrink-0 self-center text-text-muted md:flex">
                  <ChevronRight className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
