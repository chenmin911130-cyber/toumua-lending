/** Office simple-interest bands. Under $500 is 10% p.a. From $500 is 20% p.a. */
export function annualRateForAmount(principal: number): number {
  return principal < 500 ? 0.1 : 0.2;
}

export const LOAN_AMOUNT_MIN = 1_000;
export const LOAN_AMOUNT_MAX = 50_000;
export const LOAN_AMOUNT_DEFAULT = 10_000;
export const LOAN_AMOUNT_STEP = 500;

export const LOAN_TERMS = [
  { label: "1 year (12 months)", months: 12 },
  { label: "2 years (24 months)", months: 24 },
  { label: "3 years (36 months)", months: 36 },
  { label: "4 years (48 months)", months: 48 },
  { label: "5 years (60 months)", months: 60 },
] as const;

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function weeksForTerm(months: number): number {
  return Math.round((months * 52) / 12);
}

export function calcWeeklyRepayment(
  principal: number,
  months: number,
  annualRate = annualRateForAmount(principal),
): number {
  if (principal <= 0 || months <= 0) return 0;
  const weeks = weeksForTerm(months);
  const interest = principal * annualRate * (weeks / 52);
  return Math.round((principal + interest) / weeks);
}

export function calcEstimate(
  principal: number,
  months: number,
  annualRate = annualRateForAmount(principal),
) {
  const weeks = weeksForTerm(months);
  const weekly = calcWeeklyRepayment(principal, months, annualRate);
  const totalPayable = weekly * weeks;
  const totalInterest = Math.max(0, totalPayable - principal);
  return { weekly, weeks, totalPayable, totalInterest, annualRate };
}
