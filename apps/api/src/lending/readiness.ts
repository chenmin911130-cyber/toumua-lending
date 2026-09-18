import {
  ApplicationDetail,
  ApplicationStep,
  ReadinessItem,
  ValuationStatus,
} from "@toumua/contracts";

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
