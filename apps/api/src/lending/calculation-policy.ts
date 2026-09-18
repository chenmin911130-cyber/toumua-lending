/**
 * Loan calculation policy.
 *
 * Alice has not yet supplied the official interest, fee, allocation or
 * settlement rules. Until that arrives we run a labelled demo policy so
 * approvals and quotes work in the COMP721 workspace. Nothing here may be
 * presented as the office's real business rule. Swap this module (or set
 * CALCULATION_POLICY=off) when the official formula is confirmed.
 *
 * CALCULATION_POLICY:
 *   demo  — simple interest placeholder (default outside automated tests)
 *   test  — zero-interest fixture used by acceptance tests
 *   off   — block approvals and quotes
 */
import { add, compare, fromCents, isPositive, splitEvenly, subtract, sum, toCents } from "./money";

export const TEST_POLICY = "test-zero-interest";
export const DEMO_POLICY = "demo-simple-interest";

/** Homepage estimate uses 21% p.a. Same ballpark until Alice confirms a rate. */
export const DEMO_ANNUAL_RATE_BPS_DEFAULT = 2100;

export type Frequency = "WEEKLY" | "FORTNIGHTLY" | "MONTHLY";

export type PolicyTerms = {
  principal: string;
  frequency: Frequency;
  periods: number;
  firstPaymentDate: Date;
};

export type ScheduleDraft = {
  number: number;
  dueDate: Date;
  amount: string;
};

/** The active policy id, or null when calculation is deliberately switched off. */
export function activePolicy(): string | null {
  const configured = (process.env.CALCULATION_POLICY ?? "").trim();
  if (configured === "off") return null;
  if (configured === "test") return TEST_POLICY;
  if (configured === "demo") return DEMO_POLICY;
  if (process.env.NODE_ENV === "test") return TEST_POLICY;
  if (configured === "") return DEMO_POLICY;
  return null;
}

export function isPolicyConfigured(): boolean {
  return activePolicy() !== null;
}

export function termsPolicyConfigured(input: {
  firstPaymentDate?: string | null;
  frequency?: string | null;
  periods?: number | null;
}): boolean {
  const hasFields =
    Boolean(input.firstPaymentDate) && Boolean(input.frequency) && Boolean(input.periods);
  return hasFields && isPolicyConfigured();
}

export function demoAnnualRateBps(): number {
  const raw = (process.env.DEMO_ANNUAL_RATE_BPS ?? "").trim();
  if (!raw) return DEMO_ANNUAL_RATE_BPS_DEFAULT;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 10000) {
    throw new Error("DEMO_ANNUAL_RATE_BPS must be an integer from 0 to 10000");
  }
  return value;
}

function periodsPerYear(frequency: Frequency): number {
  if (frequency === "WEEKLY") return 52;
  if (frequency === "FORTNIGHTLY") return 26;
  return 12;
}

/** Simple interest in cents: principal × bps/10000 × periods/periodsPerYear. */
export function simpleInterest(principal: string, frequency: Frequency, periods: number): string {
  const numer = toCents(principal) * demoAnnualRateBps() * periods;
  const denom = 10000 * periodsPerYear(frequency);
  return fromCents(Math.round(numer / denom));
}

function payableTotal(terms: PolicyTerms): string {
  if (activePolicy() !== DEMO_POLICY) return terms.principal;
  return add(terms.principal, simpleInterest(terms.principal, terms.frequency, terms.periods));
}

/**
 * Advances a date by whole periods. Monthly steps clamp to the last day of the
 * target month so 31 January + 1 month is 28/29 February rather than 2/3 March.
 * All arithmetic is UTC so a schedule never shifts because of a local clock.
 */
export function advance(date: Date, frequency: Frequency, periods = 1): Date {
  const result = new Date(date.getTime());
  if (frequency === "WEEKLY") {
    result.setUTCDate(result.getUTCDate() + 7 * periods);
    return result;
  }
  if (frequency === "FORTNIGHTLY") {
    result.setUTCDate(result.getUTCDate() + 14 * periods);
    return result;
  }
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + periods);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/**
 * Builds the repayment plan.
 *
 * Test policy: zero interest, equal principal installments.
 * Demo policy: principal plus simple interest, split evenly.
 * Any rounding remainder is carried into the final installment.
 */
export function buildSchedule(terms: PolicyTerms): ScheduleDraft[] {
  if (!Number.isInteger(terms.periods) || terms.periods <= 0) {
    throw new Error("Periods must be a positive integer");
  }
  const parts = splitEvenly(payableTotal(terms), terms.periods);
  return parts.map((amount, index) => ({
    number: index + 1,
    dueDate: advance(terms.firstPaymentDate, terms.frequency, index + 1),
    amount,
  }));
}

export type AllocatableEntry = {
  id: string;
  number: number;
  amount: string;
  paidAmount: string;
};

export type Allocation = {
  entryId: string;
  number: number;
  amount: string;
  paidAmountAfter: string;
};

export type RepaymentQuote = {
  policy: string;
  amount: string;
  settled: boolean;
  balanceBefore: string;
  balanceAfter: string;
  allocations: Allocation[];
};

export type QuoteFailure = { reason: string };

/** Outstanding balance = sum of each installment's unpaid remainder. */
export function outstanding(entries: readonly AllocatableEntry[]): string {
  return sum(entries.map((entry) => subtract(entry.amount, entry.paidAmount)));
}

/**
 * Allocates a repayment across installments in due order.
 *
 * Overpayment is still refused: the official early-repayment / surplus rule
 * has not been provided. The demo only covers scheduled amounts.
 */
export function quoteRepayment(
  entries: readonly AllocatableEntry[],
  amount: string,
): RepaymentQuote | QuoteFailure {
  const policy = activePolicy();
  if (!policy) {
    return { reason: "No approved repayment policy is configured." };
  }
  if (!isPositive(amount)) {
    return { reason: "Enter an amount greater than zero." };
  }
  const balanceBefore = outstanding(entries);
  if (!isPositive(balanceBefore)) {
    return { reason: "This loan has no outstanding balance." };
  }
  if (compare(amount, balanceBefore) > 0) {
    return {
      reason:
        "The amount is more than the outstanding balance. Overpayment is not supported until the office provides a settlement policy.",
    };
  }

  let remaining = toCents(amount);
  const allocations: Allocation[] = [];
  for (const entry of [...entries].sort((left, right) => left.number - right.number)) {
    if (remaining <= 0) break;
    const due = toCents(subtract(entry.amount, entry.paidAmount));
    if (due <= 0) continue;
    const applied = Math.min(due, remaining);
    remaining -= applied;
    allocations.push({
      entryId: entry.id,
      number: entry.number,
      amount: fromCents(applied),
      paidAmountAfter: add(entry.paidAmount, fromCents(applied)),
    });
  }

  const balanceAfter = subtract(balanceBefore, amount);
  return {
    policy,
    amount: fromCents(toCents(amount)),
    settled: compare(balanceAfter, "0.00") === 0,
    balanceBefore,
    balanceAfter,
    allocations,
  };
}

export function isQuoteFailure(
  result: RepaymentQuote | QuoteFailure,
): result is QuoteFailure {
  return (result as QuoteFailure).reason !== undefined;
}

/** Demo records surplus/shortfall. Test policy still leaves settlement pending. */
export function isSettlementPolicyConfigured(): boolean {
  return activePolicy() === DEMO_POLICY;
}

export function quoteSettlement(balanceBefore: string, saleProceeds: string) {
  const surplusOrShortfall = subtract(saleProceeds, balanceBefore);
  const configured = isSettlementPolicyConfigured();
  return {
    policy: configured ? activePolicy() : null,
    balanceBefore,
    saleProceeds,
    surplusOrShortfall,
    pendingSettlement: !configured,
    reason: configured
      ? undefined
      : "Official settlement policy is not configured",
  };
}

export function buildTermsPreview(
  input: {
    firstPaymentDate?: string | null;
    frequency?: string | null;
    periods?: number | null;
  },
  requestedAmount: string | null,
) {
  const policy = activePolicy();
  if (!policy || !termsPolicyConfigured(input) || !requestedAmount || !input.periods) {
    return null;
  }
  const firstPaymentDate = new Date(input.firstPaymentDate as string);
  if (Number.isNaN(firstPaymentDate.getTime())) return null;
  const schedule = buildSchedule({
    principal: requestedAmount,
    frequency: input.frequency as Frequency,
    periods: input.periods,
    firstPaymentDate,
  });
  const demo = policy === DEMO_POLICY;
  return {
    policy,
    requestedAmount,
    frequency: input.frequency,
    periods: input.periods,
    firstPaymentDate: input.firstPaymentDate,
    installment: schedule[0]?.amount ?? null,
    total: sum(schedule.map((entry) => entry.amount)),
    annualRateBps: demo ? demoAnnualRateBps() : 0,
    schedule: schedule.map((entry) => ({
      number: entry.number,
      dueDate: entry.dueDate.toISOString().slice(0, 10),
      amount: entry.amount,
    })),
    note: demo
      ? "Demo schedule only. Replace these rates when the office supplies the official formula."
      : "Test-only schedule preview. Production policy is not configured.",
  };
}
