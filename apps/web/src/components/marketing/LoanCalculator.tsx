import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Calculator, ChevronRight, Info, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import {
  LOAN_AMOUNT_DEFAULT,
  LOAN_AMOUNT_MAX,
  LOAN_AMOUNT_MIN,
  LOAN_AMOUNT_STEP,
  LOAN_TERMS,
  calcWeeklyRepayment,
  formatCurrency,
} from "./loan-calculator";

export function LoanCalculator() {
  const [open, setOpen] = useState(true);
  const [amount, setAmount] = useState(LOAN_AMOUNT_DEFAULT);
  const [termIndex, setTermIndex] = useState(2);

  const term = LOAN_TERMS[termIndex];
  const weekly = useMemo(
    () => calcWeeklyRepayment(amount, term.months),
    [amount, term.months],
  );

  const sliderPercent =
    ((amount - LOAN_AMOUNT_MIN) / (LOAN_AMOUNT_MAX - LOAN_AMOUNT_MIN)) * 100;

  return (
    <div className="flex w-full justify-end">
      <AnimatePresence mode="wait" initial={false}>
        {open ? (
          <motion.div
            key="calculator"
            className="relative w-full max-w-[360px] rounded-[20px] border border-border/70 bg-white p-6 shadow-card"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.25 }}
          >
            <button
              type="button"
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:bg-bg-warm hover:text-text"
              aria-label="Close calculator"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" strokeWidth={1.8} />
            </button>

            <p className="pr-10 text-[15px] font-medium text-text-secondary">
              How much would you like to borrow?
            </p>
            <motion.p
              key={amount}
              className="mt-2 text-[42px] font-bold tracking-tight text-text"
              initial={{ opacity: 0.6 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              {formatCurrency(amount)}
            </motion.p>

            <div className="mt-6">
              <input
                type="range"
                min={LOAN_AMOUNT_MIN}
                max={LOAN_AMOUNT_MAX}
                step={LOAN_AMOUNT_STEP}
                value={amount}
                onChange={(event) => setAmount(Number(event.target.value))}
                className="loan-slider h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border"
                style={{
                  background: `linear-gradient(to right, #075E45 0%, #075E45 ${sliderPercent}%, #EAECF0 ${sliderPercent}%, #EAECF0 100%)`,
                }}
                aria-valuemin={LOAN_AMOUNT_MIN}
                aria-valuemax={LOAN_AMOUNT_MAX}
                aria-valuenow={amount}
                aria-label="Loan amount"
              />
              <div className="mt-2 flex justify-between text-[13px] text-text-muted">
                <span>{formatCurrency(LOAN_AMOUNT_MIN)}</span>
                <span>{formatCurrency(LOAN_AMOUNT_MAX)}</span>
              </div>
            </div>

            <label className="mt-6 block">
              <span className="text-[14px] font-medium text-text-secondary">Loan term</span>
              <select
                value={termIndex}
                onChange={(event) => setTermIndex(Number(event.target.value))}
                className="mt-2 h-12 w-full cursor-pointer rounded-[12px] border border-border bg-white px-4 text-[15px] text-text outline-none transition-shadow focus:border-primary focus:ring-2 focus:ring-primary/15"
              >
                {LOAN_TERMS.map((option, index) => (
                  <option key={option.months} value={index}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="mt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] text-text-secondary">Estimated repayment</p>
                  <motion.p
                    key={weekly}
                    className="mt-1 text-[30px] font-bold tracking-tight text-text"
                    initial={{ opacity: 0.6 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    {formatCurrency(weekly)}
                    <span className="text-[16px] font-semibold text-text-secondary"> / week</span>
                  </motion.p>
                </div>
                <Info className="mt-1 h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.8} aria-hidden />
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-text-muted">
                This is an estimate only. Rates and terms may vary.
              </p>
            </div>

            <Link
              to="/register"
              className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-semibold text-white no-underline transition-all hover:-translate-y-px hover:bg-primary-hover"
            >
              Get started
              <ChevronRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
          </motion.div>
        ) : (
          <motion.button
            key="open"
            type="button"
            className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-5 text-[15px] font-semibold text-text shadow-card transition-all hover:-translate-y-px"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={{ duration: 0.2 }}
            onClick={() => setOpen(true)}
          >
            <Calculator className="h-4 w-4 text-primary" strokeWidth={1.8} aria-hidden />
            Open calculator
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
