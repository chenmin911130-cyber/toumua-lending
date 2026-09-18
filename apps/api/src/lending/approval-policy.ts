import { compare, fromCents, toCents } from "./money";

/** Staff may approve at or below this amount when the file is also simple. */
export const DEFAULT_STAFF_APPROVE_LIMIT = "3000.00";

export function staffApproveLimit(): string {
  const raw = process.env.STAFF_APPROVE_LIMIT?.trim();
  if (!raw) return DEFAULT_STAFF_APPROVE_LIMIT;
  try {
    return fromCents(toCents(raw));
  } catch {
    return DEFAULT_STAFF_APPROVE_LIMIT;
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
  return {
    limit,
    requiresManager: reasons.length > 0,
    reasons,
  };
}
