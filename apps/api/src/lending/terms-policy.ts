import { SaveTermsInput } from "@toumua/contracts";

export function termsPolicyConfigured(input: SaveTermsInput) {
  const hasFields =
    Boolean(input.firstPaymentDate) &&
    Boolean(input.frequency) &&
    Boolean(input.periods);
  if (!hasFields) return false;
  if (process.env.CALCULATION_POLICY === "test" || process.env.NODE_ENV === "test") {
    return true;
  }
  return false;
}

export function buildTermsPreview(input: SaveTermsInput, requestedAmount: string | null) {
  if (!termsPolicyConfigured(input) || !requestedAmount || !input.periods) {
    return null;
  }
  const principal = Number.parseFloat(requestedAmount);
  const installment = Number.isFinite(principal)
    ? (principal / input.periods).toFixed(2)
    : null;
  return {
    policy: process.env.CALCULATION_POLICY === "test" ? "test" : "unconfigured",
    requestedAmount,
    frequency: input.frequency,
    periods: input.periods,
    firstPaymentDate: input.firstPaymentDate,
    installment,
    note:
      process.env.NODE_ENV === "test"
        ? "Test-only schedule preview. Production policy is not configured."
        : "Schedule preview unavailable until calculation policy is configured.",
  };
}
