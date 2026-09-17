import { z } from "zod";

export const ApplicationStatus = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
  APPROVED: "APPROVED",
  DECLINED: "DECLINED",
} as const;
export type ApplicationStatus = (typeof ApplicationStatus)[keyof typeof ApplicationStatus];

export const ApplicationStep = {
  BORROWER: "BORROWER",
  LOAN_DETAILS: "LOAN_DETAILS",
  SECURITY: "SECURITY",
  TERMS: "TERMS",
  REVIEW: "REVIEW",
} as const;
export type ApplicationStep = (typeof ApplicationStep)[keyof typeof ApplicationStep];

export const ValuationStatus = {
  REQUESTED: "REQUESTED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
} as const;
export type ValuationStatus = (typeof ValuationStatus)[keyof typeof ValuationStatus];

export const saveBorrowerSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  salutation: z.string().trim().max(80).optional().or(z.literal("")),
  email: z.string().trim().email("Enter a valid email address").max(254).optional().or(z.literal("")),
  phone: z.string().trim().min(1, "Phone is required").max(40),
  address: z.string().trim().min(1, "Address is required").max(500),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type SaveBorrowerInput = z.infer<typeof saveBorrowerSchema>;

export const createApplicationSchema = z.object({
  borrowerId: z.string().optional(),
});

export const patchApplicationSchema = z.object({
  expectedVersion: z.number().int().positive(),
  currentStep: z.enum([
    ApplicationStep.BORROWER,
    ApplicationStep.LOAN_DETAILS,
    ApplicationStep.SECURITY,
    ApplicationStep.TERMS,
    ApplicationStep.REVIEW,
  ]).optional(),
  borrowerId: z.string().nullable().optional(),
  requestedAmount: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount")
    .optional()
    .nullable(),
  purpose: z.string().trim().min(1).max(200).optional().nullable(),
  purposeDescription: z.string().trim().max(2000).optional().nullable(),
  proposedTermMonths: z.number().int().positive().optional().nullable(),
});

export type PatchApplicationInput = z.infer<typeof patchApplicationSchema>;

export const saveAssetSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  description: z.string().trim().min(1, "Description is required").max(2000),
  condition: z.string().trim().min(1, "Condition is required").max(200),
  category: z.string().trim().max(120).optional().or(z.literal("")),
  identifier: z.string().trim().max(120).optional().or(z.literal("")),
});

export type SaveAssetInput = z.infer<typeof saveAssetSchema>;

export const saveTermsSchema = z.object({
  expectedVersion: z.number().int().positive(),
  firstPaymentDate: z.string().optional().nullable(),
  frequency: z.enum(["WEEKLY", "FORTNIGHTLY", "MONTHLY"]).optional().nullable(),
  periods: z.number().int().positive().optional().nullable(),
  interestMethod: z.string().trim().max(120).optional().nullable(),
});

export type SaveTermsInput = z.infer<typeof saveTermsSchema>;

export const completeValuationSchema = z.object({
  expectedVersion: z.number().int().positive(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount"),
  valuationDate: z.string().min(1, "Valuation date is required"),
  basis: z.string().trim().min(1, "Basis is required").max(2000),
  borrowerPresent: z.boolean(),
  loanOfficerId: z.string().min(1, "Loan officer is required"),
  valuationOfficerId: z.string().min(1, "Valuation officer is required"),
  participatedAt: z.string().min(1, "Participation time is required"),
});

export type CompleteValuationInput = z.infer<typeof completeValuationSchema>;

export const linkAccountSchema = z.object({
  userId: z.string().min(1),
  verificationMethod: z.string().trim().min(1, "Verification method is required").max(200),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  confirmIdentity: z.literal(true, {
    errorMap: () => ({ message: "Confirm identity before linking" }),
  }),
});

export type LinkAccountInput = z.infer<typeof linkAccountSchema>;

export const revokeLinkSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required").max(2000),
});

export type BorrowerSummary = {
  id: string;
  number: string;
  name: string;
  salutation: string | null;
  email: string | null;
  phone: string;
  address: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  linkedUserId?: string | null;
};

export type ApplicationSummary = {
  id: string;
  number: string;
  status: ApplicationStatus;
  currentStep: ApplicationStep;
  version: number;
  borrowerId: string | null;
  borrowerName: string | null;
  requestedAmount: string | null;
  purpose: string | null;
  submittedAt: string | null;
  updatedAt: string;
};

export type ReadinessItem = {
  id: string;
  label: string;
  complete: boolean;
  href?: string;
};

export type ApplicationDetail = ApplicationSummary & {
  purposeDescription: string | null;
  proposedTermMonths: number | null;
  assets: Array<{
    id: string;
    name: string;
    description: string;
    condition: string;
    category: string | null;
    identifier: string | null;
    photoCount: number;
    valuationStatus: ValuationStatus | null;
  }>;
  terms: {
    firstPaymentDate: string | null;
    frequency: string | null;
    periods: number | null;
    interestMethod: string | null;
    policyConfigured: boolean;
    previewAvailable: boolean;
  } | null;
  readiness: ReadinessItem[];
};
