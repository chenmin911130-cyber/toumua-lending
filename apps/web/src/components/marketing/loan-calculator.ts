/** Illustrative rate for homepage estimates only — not a live offer. */
/** Tuned so $10,000 over 36 months ≈ $87/week in the homepage demo. */
export const ESTIMATE_ANNUAL_RATE = 0.21;

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

export function calcWeeklyRepayment(
  principal: number,
  months: number,
  annualRate = ESTIMATE_ANNUAL_RATE,
): number {
  if (principal <= 0 || months <= 0) return 0;
  const monthlyRate = annualRate / 12;
  const factor = Math.pow(1 + monthlyRate, months);
  const monthly =
    (principal * monthlyRate * factor) / (factor - 1);
  return Math.round((monthly * 12) / 52);
}
