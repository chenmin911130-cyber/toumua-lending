import { compare, fromCents, toCents } from "./money";

/** Profile default: a loan officer never approves. Set STAFF_APPROVE_LIMIT to opt back in. */
export function staffApproveLimit(): string {
  const raw = process.env.STAFF_APPROVE_LIMIT?.trim();
  if (!raw) return "0.00";
  try {
    return fromCents(toCents(raw));
  } catch {
    return "0.00";
  }
}

export type ApprovalRouting = {
  limit: string;
  requiresManager: boolean;
  reasons: string[];
};

const COMPLEX_NOTE_CHARS = 180;

export function classifyApproval(input: {
  requestedAmount: string | null;
  purpose: string | null;
  purposeDescription: string | null;
  assetCount: number;
}): ApprovalRouting {
  const limit = staffApproveLimit();
  const reasons: string[] = [];
  if (input.requestedAmount && compare(input.requestedAmount, limit) > 0) {
    reasons.push(`Requested amount is above the staff limit of $${limit}`);
  }
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
  const officersNeverApprove = compare(limit, "0.00") === 0;
  if (officersNeverApprove) {
    reasons.unshift("Approval is a manager decision");
  }
  return {
    limit,
    requiresManager: officersNeverApprove || reasons.length > 0,
    reasons,
  };
}
