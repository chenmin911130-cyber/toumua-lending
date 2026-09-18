/**
 * Loan calculation policy.
 *
 * The office has not supplied official interest, fee, allocation or settlement
 * rules, so no production policy exists. This module therefore exposes one
 * explicitly-labelled test policy that is only enabled by configuration, and
 * reports "unconfigured" everywhere else. Nothing here may be presented as a
 * real business rule, and production submissions stay blocked without it.
 */
import { add, compare, fromCents, isPositive, splitEvenly, subtract, sum, toCents } from "./money";

export const TEST_POLICY = "test-zero-interest";

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

/** The active policy id, or null when no production policy is configured. */
export function activePolicy(): string | null {
  if (process.env.CALCULATION_POLICY === "test" || process.env.NODE_ENV === "test") {
    return TEST_POLICY;
  }
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
 * Builds the approved repayment plan: zero interest, zero fees, equal principal
 * installments, with any rounding remainder carried into the final installment
 * so the installments always add up to exactly the principal.
 */
export function buildSchedule(terms: PolicyTerms): ScheduleDraft[] {
  if (!Number.isInteger(terms.periods) || terms.periods <= 0) {
    throw new Error("Periods must be a positive integer");
  }
  const parts = splitEvenly(terms.principal, terms.periods);
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
 * Rejections are returned as reasons rather than silently rounded or absorbed,
 * because the official policy for overpayment, early repayment and backdating
 * has not been provided and must not be invented here.
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

/** Kept for the schedule preview on the terms step (test policy only). */
/** Official surplus/shortfall settlement is an external dependency. */
export function isSettlementPolicyConfigured(): boolean {
  return false;
}

export function quoteSettlement(balanceBefore: string, saleProceeds: string) {
  const surplusOrShortfall = subtract(saleProceeds, balanceBefore);
  return {
    policy: null as string | null,
    balanceBefore,
    saleProceeds,
    surplusOrShortfall,
    pendingSettlement: !isSettlementPolicyConfigured(),
    reason: isSettlementPolicyConfigured()
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
  return {
    policy,
    requestedAmount,
    frequency: input.frequency,
    periods: input.periods,
    firstPaymentDate: input.firstPaymentDate,
    installment: schedule[0]?.amount ?? null,
    total: sum(schedule.map((entry) => entry.amount)),
    schedule: schedule.map((entry) => ({
      number: entry.number,
      dueDate: entry.dueDate.toISOString().slice(0, 10),
      amount: entry.amount,
    })),
    note: "Test-only schedule preview. Production policy is not configured.",
  };
}
