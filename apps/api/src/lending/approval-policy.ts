/**
 * Advisory complexity flags for a manager's review.
 *
 * The COMP721 brief states the loan application "will finally be decided by the
 * manager whether denial or approval based on her business discretion". The
 * officer prepares the file and the valuation; every approve/decline decision is
 * the manager's. There is therefore no staff monetary approval threshold, and
 * this function only highlights files a manager should look at carefully.
 */
export type ApprovalRouting = {
  complex: boolean;
  reasons: string[];
};

const COMPLEX_NOTE_CHARS = 180;

export function classifyApproval(input: {
  requestedAmount: string | null;
  purpose: string | null;
  purposeDescription: string | null;
  assetCount: number;
}): ApprovalRouting {
  const reasons: string[] = [];
  if (input.assetCount >= 3) {
    reasons.push("Three or more security assets need a manager to review");
  }
  const purpose = (input.purpose ?? "").trim().toLowerCase();
  if (purpose === "other") {
    reasons.push("Purpose is recorded as Other");
  }
  if ((input.purposeDescription ?? "").trim().length >= COMPLEX_NOTE_CHARS) {
    reasons.push("The application notes are long enough to need manager help");
  }
  return {
    complex: reasons.length > 0,
    reasons,
  };
}
