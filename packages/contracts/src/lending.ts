import { z } from "zod";

/** Accepts an ISO date or date-time string; rejects values that do not parse. */
const dateString = (label: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z
      .string()
      .min(1, `${label} is required`)
      .refine((value) => !Number.isNaN(Date.parse(value)), `${label} is not a valid date`),
  );

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
  firstPaymentDate: dateString("First payment date").optional().nullable(),
  frequency: z.enum(["WEEKLY", "FORTNIGHTLY", "MONTHLY"]).optional().nullable(),
  periods: z.number().int().positive().optional().nullable(),
  interestMethod: z.string().trim().max(120).optional().nullable(),
});

export type SaveTermsInput = z.infer<typeof saveTermsSchema>;

export const completeValuationSchema = z.object({
  expectedVersion: z.number().int().positive(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount"),
  valuationDate: dateString("Valuation date"),
  basis: z.string().trim().min(1, "Basis is required").max(2000),
  borrowerPresent: z.boolean(),
  loanOfficerId: z.string().min(1, "Loan officer is required"),
  valuationOfficerId: z.string().min(1, "Valuation officer is required"),
  participatedAt: dateString("Participation time"),
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
    photos: Array<{ id: string; url: string }>;
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

/* ------------------------------------------------------------------ *
 * Batch 04: approval, collateral custody, loans and money movements
 * ------------------------------------------------------------------ */

export const LoanStatus = {
  APPROVED_UNFUNDED: "APPROVED_UNFUNDED",
  ACTIVE: "ACTIVE",
  SETTLED: "SETTLED",
  DEFAULTED: "DEFAULTED",
} as const;
export type LoanStatus = (typeof LoanStatus)[keyof typeof LoanStatus];

export const AssetStatus = {
  PROPOSED: "PROPOSED",
  VALUED: "VALUED",
  STORED: "STORED",
  RETURNED: "RETURNED",
  SOLD: "SOLD",
} as const;
export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

export const CustodyEventType = {
  RECEIVED: "RECEIVED",
  INSPECTED: "INSPECTED",
  STORED: "STORED",
  RELOCATED: "RELOCATED",
  RETURNED: "RETURNED",
  SOLD: "SOLD",
} as const;
export type CustodyEventType = (typeof CustodyEventType)[keyof typeof CustodyEventType];

export const PaymentAttemptStatus = {
  PENDING: "PENDING",
  COMMITTED: "COMMITTED",
  REJECTED: "REJECTED",
  /**
   * A timeout is never proof that no money moved, so UNKNOWN is deliberately
   * distinct from REJECTED: only a known-unposted attempt may be retried.
   */
  UNKNOWN: "UNKNOWN",
} as const;
export type PaymentAttemptStatus =
  (typeof PaymentAttemptStatus)[keyof typeof PaymentAttemptStatus];

export const LedgerEntryType = {
  DISBURSEMENT: "DISBURSEMENT",
  REPAYMENT: "REPAYMENT",
  SALE_RECEIPT: "SALE_RECEIPT",
} as const;
export type LedgerEntryType = (typeof LedgerEntryType)[keyof typeof LedgerEntryType];

export const PaymentMethod = {
  CASH: "CASH",
  BANK_TRANSFER: "BANK_TRANSFER",
  CHEQUE: "CHEQUE",
  MOBILE_WALLET: "MOBILE_WALLET",
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PAYMENT_METHODS = Object.values(PaymentMethod) as PaymentMethod[];

/** Cash needs no external reference; every other method does. */
export const METHOD_REQUIRES_REFERENCE: Record<PaymentMethod, boolean> = {
  CASH: false,
  BANK_TRANSFER: true,
  CHEQUE: true,
  MOBILE_WALLET: true,
};

/** Business dates are calendar dates, never instants. */
const businessDateField = (label: string) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a YYYY-MM-DD date`)
      .refine((value) => !Number.isNaN(Date.parse(value)), `${label} is not a valid date`),
  );

const moneyField = (label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, `${label} must be an amount with at most two decimals`);

const paymentMethodField = z.enum([
  PaymentMethod.CASH,
  PaymentMethod.BANK_TRANSFER,
  PaymentMethod.CHEQUE,
  PaymentMethod.MOBILE_WALLET,
]);

/** Rejects a method that requires an external reference when none was given. */
const requireReference = (
  value: { method?: PaymentMethod; externalReference?: string | null },
  context: z.RefinementCtx,
) => {
  if (!value.method) return;
  if (METHOD_REQUIRES_REFERENCE[value.method] && !value.externalReference?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["externalReference"],
      message: "An external reference is required for this method",
    });
  }
};

export const decisionSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    decision: z.enum(["approve", "decline"]),
    reviewed: z.boolean().optional(),
    reason: z.string().trim().max(1000).optional().nullable(),
    publicNote: z.string().trim().max(1000).optional().nullable(),
  })
  .superRefine((value, context) => {
    if (value.decision === "approve" && value.reviewed !== true) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reviewed"],
        message: "Confirm the review checklist before approving",
      });
    }
    if (value.decision === "decline" && !value.reason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reason"],
        message: "A reason is required to decline",
      });
    }
  });

export type DecisionInput = z.infer<typeof decisionSchema>;

export const intakeSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    receivedOn: businessDateField("Received date"),
    inspectedOn: businessDateField("Inspection date"),
    inspectionResult: z.enum(["PASS", "FAIL"]),
    inspectionNote: z.string().trim().max(2000).optional().nullable(),
    location: z.string().trim().max(200).optional().nullable(),
    conditionNote: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine((value, context) => {
    // A failed inspection must say why and can never open the loan for funding.
    if (value.inspectionResult === "FAIL" && !value.inspectionNote?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inspectionNote"],
        message: "Explain what did not match the valuation",
      });
    }
    if (value.inspectionResult === "PASS" && !value.location?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["location"],
        message: "A storage location is required to store the asset",
      });
    }
  });

export type IntakeInput = z.infer<typeof intakeSchema>;

export const custodyUpdateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  location: z.string().trim().min(1, "Storage location is required").max(200),
  conditionNote: z.string().trim().max(2000).optional().nullable(),
  reason: z.string().trim().min(1, "A reason is required").max(1000),
});

export type CustodyUpdateInput = z.infer<typeof custodyUpdateSchema>;

export const disbursementSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    businessDate: businessDateField("Business date"),
    method: paymentMethodField,
    externalReference: z.string().trim().max(200).optional().nullable(),
    note: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine(requireReference);

export type DisbursementInput = z.infer<typeof disbursementSchema>;

export const repaymentSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    amount: moneyField("Amount"),
    businessDate: businessDateField("Business date"),
    method: paymentMethodField,
    externalReference: z.string().trim().max(200).optional().nullable(),
    note: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine(requireReference);

export type RepaymentInput = z.infer<typeof repaymentSchema>;

export const settlementQuoteQuerySchema = z.object({
  type: z.literal("settlement"),
});

export const repaymentQuoteQuerySchema = z.object({
  amount: moneyField("Amount"),
  businessDate: businessDateField("Business date").optional(),
});

export const quoteQuerySchema = z.union([settlementQuoteQuerySchema, repaymentQuoteQuerySchema]);

export type QuoteQuery = z.infer<typeof quoteQuerySchema>;

export type AllowedAction = {
  id: string;
  label: string;
  allowed: boolean;
  /** Why it is not allowed; present only when allowed is false. */
  reason?: string;
};

export type ScheduleEntryView = {
  id: string;
  number: number;
  dueDate: string;
  amount: string;
  paidAmount: string;
  outstanding: string;
  status: "PENDING" | "PAID";
  overdue: boolean;
};

export type LoanSummary = {
  id: string;
  number: string;
  status: LoanStatus;
  borrowerId: string;
  borrowerName: string | null;
  applicationId: string;
  applicationNumber: string | null;
  principal: string;
  balance: string;
  frequency: string;
  periods: number;
  firstPaymentDate: string;
  disbursedAt: string | null;
  settledAt: string | null;
  defaultedAt: string | null;
  updatedAt: string;
  nextDueDate: string | null;
};

export type CustomerAssetView = {
  id: string;
  name: string;
  description: string;
  condition: string;
  category: string | null;
  identifier: string | null;
  status: AssetStatus;
  valuationAmount: string | null;
  valuationStatus: ValuationStatus | null;
  photoCount: number;
  photoIds: string[];
};

export type CustomerReceiptSummary = {
  id: string;
  number: string;
  type: string;
  amount: string;
  businessDate: string;
  createdAt: string;
};

export type CustomerLoanDetail = {
  id: string;
  number: string;
  status: LoanStatus;
  borrowerName: string | null;
  applicationNumber: string | null;
  principal: string;
  balance: string;
  frequency: string;
  periods: number;
  firstPaymentDate: string;
  disbursedAt: string | null;
  settledAt: string | null;
  defaultedAt: string | null;
  defaultReason?: string | null;
  overdueAmount: string;
  nextDueDate: string | null;
  schedule: ScheduleEntryView[];
  assets: CustomerAssetView[];
  receipts: CustomerReceiptSummary[];
};

export type LoanDetail = LoanSummary & {
  version: number;
  interestMethod: string | null;
  policy: string;
  policyConfigured: boolean;
  defaultReason?: string | null;
  overdueAmount: string;
  schedule: ScheduleEntryView[];
  allowedActions: AllowedAction[];
};

export type CustodyEventView = {
  id: string;
  type: CustodyEventType;
  businessDate: string;
  location: string | null;
  inspectionResult: string | null;
  conditionNote: string | null;
  reason: string | null;
  recordedBy: string | null;
  createdAt: string;
};

export type AssetView = {
  id: string;
  applicationId: string;
  applicationNumber: string | null;
  loanId: string | null;
  loanNumber: string | null;
  name: string;
  description: string;
  condition: string;
  category: string | null;
  identifier: string | null;
  status: AssetStatus;
  version: number;
  photoCount: number;
  valuationAmount: string | null;
  valuationStatus: ValuationStatus | null;
  storageLocation: string | null;
  receivedOn: string | null;
  inspectedOn: string | null;
  inspectionResult: string | null;
  saleDraft: Record<string, unknown> | null;
  custody: CustodyEventView[];
  allowedActions: AllowedAction[];
};

export type ReadinessCheck = {
  id: string;
  label: string;
  complete: boolean;
  detail?: string;
};

export type DisbursementReadiness = {
  ready: boolean;
  items: ReadinessCheck[];
};

export type ReceiptView = {
  id: string;
  number: string;
  loanId: string;
  loanNumber: string | null;
  type: "DISBURSEMENT" | "REPAYMENT" | "SALE_RECEIPT";
  amount: string;
  businessDate: string;
  method: string;
  externalReference: string | null;
  note: string | null;
  balanceAfter: string;
  issuedBy: string | null;
  createdAt: string;
  summary: Record<string, unknown>;
};

export type TransactionView = {
  id: string;
  loanId: string;
  loanNumber: string | null;
  borrowerName: string | null;
  type: "DISBURSEMENT" | "REPAYMENT" | "SALE_RECEIPT";
  amount: string;
  businessDate: string;
  method: string;
  externalReference: string | null;
  note: string | null;
  postedBy: string | null;
  createdAt: string;
  receiptId: string | null;
  receiptNumber: string | null;
};

export type PaymentAttemptView = {
  id: string;
  type: "DISBURSEMENT" | "REPAYMENT" | "SALE_RECEIPT";
  status: PaymentAttemptStatus;
  loanId: string;
  loanNumber: string | null;
  requestBody: Record<string, unknown>;
  failureReason: string | null;
  ledgerEntryId: string | null;
  receiptId: string | null;
  committedAt: string | null;
  createdAt: string;
};

export type RepaymentQuoteView = {
  policy: string;
  amount: string;
  settled: boolean;
  balanceBefore: string;
  balanceAfter: string;
  allocations: Array<{
    entryId: string;
    number: number;
    amount: string;
    paidAmountAfter: string;
  }>;
  schedule: ScheduleEntryView[];
};

/* ------------------------------------------------------------------ *
 * Batch 05: default, return, sale, corrections, settlement
 * ------------------------------------------------------------------ */

export const CorrectionStatus = {
  REQUESTED: "REQUESTED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  POSTED: "POSTED",
} as const;
export type CorrectionStatus = (typeof CorrectionStatus)[keyof typeof CorrectionStatus];

export const defaultSchema = z.object({
  expectedVersion: z.number().int().positive(),
  businessDate: businessDateField("Default date"),
  reason: z.string().trim().min(1, "Reason is required").max(2000),
  policyBasis: z.string().trim().min(1, "Policy basis is required").max(2000),
});

export type DefaultInput = z.infer<typeof defaultSchema>;

export const returnSchema = z.object({
  expectedVersion: z.number().int().positive(),
  returnedOn: businessDateField("Return date"),
  recipientName: z.string().trim().min(1, "Recipient name is required").max(160),
  verificationMethod: z.string().trim().min(1, "Verification method is required").max(200),
  conditionNote: z.string().trim().max(2000).optional().nullable(),
  identityConfirmed: z.literal(true, {
    errorMap: () => ({ message: "Confirm borrower and asset identity before returning" }),
  }),
});

export type ReturnInput = z.infer<typeof returnSchema>;

export const saleDraftSchema = z.object({
  buyerName: z.string().trim().min(1, "Buyer name is required").max(160),
  buyerContact: z.string().trim().min(1, "Buyer contact is required").max(200),
  saleAmount: moneyField("Sale amount"),
  saleDate: businessDateField("Sale date"),
  method: z.string().trim().min(1, "Disposal method is required").max(200),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export type SaleDraftInput = z.infer<typeof saleDraftSchema>;

export const saleSchema = saleDraftSchema.extend({
  expectedVersion: z.number().int().positive(),
  receiptId: z.string().optional().nullable(),
});

export type SaleInput = z.infer<typeof saleSchema>;

export const saleReceiptSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    amount: moneyField("Amount"),
    businessDate: businessDateField("Business date"),
    method: paymentMethodField,
    externalReference: z.string().trim().max(200).optional().nullable(),
    note: z.string().trim().max(2000).optional().nullable(),
  })
  .superRefine(requireReference);

export type SaleReceiptInput = z.infer<typeof saleReceiptSchema>;

export const correctionRequestSchema = z.object({
  originalLedgerEntryId: z.string().min(1),
  reason: z.string().trim().min(1, "Reason is required").max(2000),
  proposedValues: z.object({
    amount: moneyField("Amount").optional(),
    businessDate: businessDateField("Business date").optional(),
    method: paymentMethodField.optional(),
    externalReference: z.string().trim().max(200).optional().nullable(),
    note: z.string().trim().max(2000).optional().nullable(),
  }),
});

export type CorrectionRequestInput = z.infer<typeof correctionRequestSchema>;

export const correctionDecisionSchema = z.object({
  expectedVersion: z.number().int().positive(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(2000).optional().nullable(),
});

export type CorrectionDecisionInput = z.infer<typeof correctionDecisionSchema>;

export type CorrectionView = {
  id: string;
  status: CorrectionStatus;
  version: number;
  originalLedgerEntryId: string;
  originalTransaction: TransactionView | null;
  proposedValues: Record<string, unknown>;
  reason: string;
  requestedBy: string | null;
  decidedBy: string | null;
  decisionReason: string | null;
  reversalEntryId: string | null;
  replacementEntryId: string | null;
  createdAt: string;
  updatedAt: string;
  allowedActions: AllowedAction[];
};

export type SettlementQuoteView = {
  policy: string | null;
  balanceBefore: string;
  saleProceeds: string;
  surplusOrShortfall: string;
  pendingSettlement: boolean;
  reason?: string;
};

