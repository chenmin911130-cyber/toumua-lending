import { ChevronRight, CircleCheck, ClipboardList, Search } from "lucide-react";
import { motion } from "framer-motion";

const STEPS = [
  {
    num: "01",
    icon: ClipboardList,
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
    <section id="how-it-works" className="bg-white py-16 md:py-20 lg:py-[88px]">
      <div className="marketing-wrap">
        <h2 className="text-left text-[clamp(30px,3.5vw,40px)] font-bold tracking-tight text-text">
          Borrowing made simple
        </h2>
        <p className="mt-3 max-w-[520px] text-left text-[17px] leading-relaxed text-text-secondary">
          A straightforward process from application to approval.
        </p>

        <div className="mt-12 flex flex-col gap-10 md:flex-row md:items-start md:gap-4 lg:gap-6">
          {STEPS.map((step, index) => (
            <div key={step.num} className="flex items-start gap-4 md:gap-5">
              <motion.article
                className="max-w-[250px]"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.4, delay: index * 0.08 }}
              >
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
              </motion.article>
              {index < STEPS.length - 1 ? (
                <ChevronRight
                  className="mt-3 hidden h-5 w-5 shrink-0 text-text-muted md:block"
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
