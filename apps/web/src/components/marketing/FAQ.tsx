import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const FAQ_ITEMS = [
  {
    q: "How much can I borrow?",
    a: "Loan amounts depend on your circumstances and the type of finance you need. Use the calculator on our homepage to explore indicative options, then speak with our team for a personalised assessment.",
  },
  {
    q: "How long does an application take?",
    a: "Many applications receive an initial response quickly once submitted. Final approval timing depends on the information required and the type of loan.",
  },
  {
    q: "What documents will I need?",
    a: "Typically we ask for proof of identity, income and any supporting details relevant to your loan purpose. Our team will guide you through exactly what applies to your situation.",
  },
  {
    q: "Can I repay my loan early?",
    a: "Early repayment may be available depending on your loan terms. Contact us to understand any applicable fees or adjustments before making extra payments.",
  },
  {
    q: "How are repayments calculated?",
    a: "Repayments are based on your loan amount, term and interest rate. The homepage calculator provides an estimate only — your actual offer may differ after assessment.",
  },
] as const;

export function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="text-[16px] font-semibold text-text">{question}</span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary">
          {open ? (
            <Minus className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          ) : (
            <Plus className="h-4 w-4" strokeWidth={1.8} aria-hidden />
          )}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="pb-5 pr-12 text-[15px] leading-relaxed text-text-secondary">{answer}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function FAQ() {
  return (
    <section id="faq" className="bg-white py-16 md:py-24 lg:py-[96px]">
      <div className="marketing-wrap">
        <h2 className="max-w-[760px] text-left text-[clamp(30px,3.5vw,40px)] font-bold tracking-tight text-text">
          Frequently asked questions
        </h2>
        <div className="mt-10 max-w-[760px]">
          {FAQ_ITEMS.map((item) => (
            <FAQItem key={item.q} question={item.q} answer={item.a} />
          ))}
        </div>
      </div>
    </section>
  );
}
