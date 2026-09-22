import {
  ApplicationDetail,
  ApplicationStep,
  ReadinessItem,
  ValuationStatus,
} from "@toumua/contracts";
import { fromCents, toCents } from "./money";

/**
 * Minimum collateral coverage ratio (security valuation ÷ loan amount).
 * The client requires the value of the security assets to be significantly
 * greater than the loan amount. Set to, e.g., 1.10 to require 110% coverage;
 * the default 1.00 requires valuation >= loan.
 */
export function minAssetCoverage(): number {
  const raw = process.env.MIN_ASSET_COVERAGE?.trim();
  if (!raw) return 1.0;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 1.0;
  return value;
}

/**
 * True when the total completed valuation of the security assets covers the
 * requested loan amount at the configured coverage ratio. Works in integer
 * cents so a rounding drift can never flip the outcome.
 */
export function isValuationCovered(
  requestedAmount: string | null,
  valuationTotal: string,
): boolean {
  if (!requestedAmount || toCents(requestedAmount) === 0) return true;
  const required = toCents(requestedAmount) * minAssetCoverage();
  return toCents(valuationTotal) >= Math.round(required);
}

function valuationTotalOf(input: ReadinessInput): string {
  const cents = input.assets.reduce(
    (total, asset) => total + (asset.valuationAmount ?? 0),
    0,
  );
  return fromCents(cents);
}

type ReadinessInput = {
  id: string;
  status: string;
  borrowerId: string | null;
  requestedAmount: string | null;
  purpose: string | null;
  proposedTermMonths: number | null;
  assets: Array<{
    id: string;
    name: string;
    photoCount: number;
    valuationStatus: string | null;
    /** Completed valuation in cents, 0 when none. */
    valuationAmount?: number | null;
  }>;
  terms: {
    firstPaymentDate: Date | null;
    frequency: string | null;
    periods: number | null;
    policyConfigured: boolean;
  } | null;
};

export function buildReadiness(input: ReadinessInput): ReadinessItem[] {
  const borrowerComplete = Boolean(input.borrowerId);
  const loanComplete =
    Boolean(input.requestedAmount) &&
    Boolean(input.purpose) &&
    input.proposedTermMonths != null &&
    input.proposedTermMonths > 0;
  const assetsComplete =
    input.assets.length > 0 &&
    input.assets.every((asset) => asset.photoCount > 0);
  const valuationsComplete =
    input.assets.length > 0 &&
    input.assets.every(
      (asset) => asset.valuationStatus === ValuationStatus.COMPLETED,
    );
  const termsComplete = Boolean(
    input.terms?.firstPaymentDate &&
      input.terms.frequency &&
      input.terms.periods &&
      input.terms.policyConfigured,
  );

  return [
    {
      id: "borrower",
      label: "Borrower selected",
      complete: borrowerComplete,
      href: `/staff/applications/${input.id}/edit/${ApplicationStep.BORROWER.toLowerCase()}`,
    },
    {
      id: "loan-details",
      label: "Loan details completed",
      complete: loanComplete,
      href: `/staff/applications/${input.id}/edit/loan_details`,
    },
    {
      id: "security",
      label: "Security assets with photos",
      complete: assetsComplete,
      href: `/staff/applications/${input.id}/edit/security`,
    },
    {
      id: "valuations",
      label: "All assets valued",
      complete: valuationsComplete,
      href: `/staff/applications/${input.id}/valuation`,
    },
    {
      id: "assets-covered",
      label: "Security value covers the loan amount",
      complete: isValuationCovered(input.requestedAmount, valuationTotalOf(input)),
      href: `/staff/applications/${input.id}/valuation`,
    },
    {
      id: "terms",
      label: "Repayment terms configured",
      complete: termsComplete,
      href: `/staff/applications/${input.id}/edit/terms`,
    },
  ];
}

export function isReadyToSubmit(items: ReadinessItem[]) {
  return items.every((item) => item.complete);
}

/**
 * Staff submit gate. It requires valuation completion so a manager reviews a
 * valued file, but it does NOT require the coverage rule: that is enforced only
 * at the approval decision, because the coverage wording depends on the final
 * loan amount and is a decision-time business rule, not a submit prerequisite.
 */
export const STAFF_SUBMIT_IDS = new Set([
  "borrower",
  "loan-details",
  "security",
  "valuations",
  "terms",
]);

export function isReadyForStaffSubmit(items: ReadinessItem[]) {
  return items
    .filter((item) => STAFF_SUBMIT_IDS.has(item.id))
    .every((item) => item.complete);
}

/** Customer online apply: contact + loan + security photos. Valuation and terms stay with staff. */
export const CUSTOMER_SUBMIT_IDS = new Set(["borrower", "loan-details", "security"]);

export function isReadyForCustomerSubmit(items: ReadinessItem[]) {
  return items
    .filter((item) => CUSTOMER_SUBMIT_IDS.has(item.id))
    .every((item) => item.complete);
}

export function attachReadiness(detail: Omit<ApplicationDetail, "readiness">, raw: ReadinessInput) {
  const readiness = buildReadiness(raw);
  return { ...detail, readiness };
}
