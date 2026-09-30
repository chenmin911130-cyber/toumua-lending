import { Inject, Injectable } from "@nestjs/common";
import {
  ApplicationStatus,
  DecisionInput,
  LoanStatus,
  PaymentAttemptStatus,
  ValuationStatus,
  type AllowedAction,
} from "@toumua/contracts";
import { AuthUser } from "../auth/session";
import { conflict, forbidden, notFound, validation } from "../common/http";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertDecideApplication, assertReviewDecision, isManager } from "./access";
import { classifyApproval } from "./approval-policy";
import { activePolicy, buildSchedule, type Frequency } from "./calculation-policy";
import { sum, toCents } from "./money";
import { NotificationsService } from "../notifications/notifications.service";
import { NumbersService } from "./numbers.service";
import { buildReadiness } from "./readiness";

/**
 * The manager decision. Approval freezes the reviewed snapshot into a loan and
 * its repayment plan; nothing afterwards may edit the approved terms, so this is
 * the point where a submitted application becomes immutable.
 */
@Injectable()
export class DecisionsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NumbersService) private readonly numbers: NumbersService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  /**
   * Advisory list for the review screen. The server re-checks every one of these
   * conditions inside the decision transaction, so a stale UI cannot approve
   * something that stopped being approvable.
   */
  async review(user: AuthUser, applicationId: string) {
    assertReviewDecision(user);
    const application = await this.loadForDecision(applicationId);
    const checks = this.preconditions(application);
    const routing = this.routingOf(application);
    const ready = checks.every((check) => check.complete);
    const manager = isManager(user);
    const submitted = application.status === ApplicationStatus.SUBMITTED;
    // The brief gives the final approve/decline decision to the manager only.
    const canApprove = submitted && ready && manager;
    const canDecline = submitted && manager;
    const assets = application.assets.map((asset) => {
      const valuation = asset.valuations[0];
      const valuationAmount = valuation?.status === "COMPLETED" ? valuation.amount : null;
      return {
        id: asset.id,
        name: asset.name,
        description: asset.description,
        photoCount: asset.photos.length,
        valuationStatus: valuation?.status ?? null,
        valuationAmount,
      };
    });
    return {
      id: application.id,
      number: application.number,
      status: application.status,
      version: application.version,
      borrowerName: application.borrower?.name ?? null,
      requestedAmount: application.requestedAmount,
      purpose: application.purpose,
      proposedTermMonths: application.proposedTermMonths,
      assets,
      valuationTotal: sum(assets.map((asset) => asset.valuationAmount ?? "0.00")),
      managerReasons: routing.reasons,
      requiresManager: true,
      checks,
      canApprove,
      canDecline,
      allowedActions: this.allowedActions(application, checks, user),
    };
  }

  async decide(user: AuthUser, applicationId: string, input: DecisionInput) {
    // Approve and decline are both manager decisions, whatever the amount.
    assertDecideApplication(user);

    const application = await this.loadForDecision(applicationId);
    if (application.status !== ApplicationStatus.SUBMITTED) {
      throw conflict(
        application.status === ApplicationStatus.DRAFT
          ? "Submit the application before deciding on it"
          : "This application already has a decision",
      );
    }
    if (application.version !== input.expectedVersion) {
      throw conflict("This application was updated elsewhere. Reload and compare before deciding.");
    }

    if (input.decision === "approve") {
      return this.approve(user, application, input);
    }
    return this.decline(user, application, input);
  }

  private async approve(
    user: AuthUser,
    application: Awaited<ReturnType<DecisionsService["loadForDecision"]>>,
    input: DecisionInput,
  ) {
    const checks = this.preconditions(application);
    const blocking = checks.filter((check) => !check.complete);
    if (blocking.length > 0) {
      throw validation("This application is not ready for approval", {
        readiness: blocking.map((check) => check.label),
      });
    }

    const terms = application.terms;
    // Terms and their policy are frozen at approval, so an unconfigured policy
    // must block here rather than produce a schedule nobody approved.
    if (!terms?.policyConfigured || !activePolicy()) {
      throw validation("No approved calculation policy is configured for this loan", {
        policy: ["Repayment terms cannot be frozen without an approved policy"],
      });
    }

    const principal = application.requestedAmount as string;
    const frequency = terms.frequency as Frequency;
    const periods = terms.periods as number;
    const firstPaymentDate = terms.firstPaymentDate as Date;
    const schedule = buildSchedule({ principal, frequency, periods, firstPaymentDate });
    const policy = activePolicy() as string;

    const result = await this.prisma.$transaction(async (tx) => {
      // Optimistic lock: only the first decision on this exact version wins.
      const locked = await tx.application.updateMany({
        where: { id: application.id, version: input.expectedVersion, status: ApplicationStatus.SUBMITTED },
        data: { status: ApplicationStatus.APPROVED, version: { increment: 1 } },
      });
      if (locked.count === 0) {
        throw conflict("Another decision was recorded first. Reload to see the outcome.");
      }

      await tx.applicationDecision.create({
        data: {
          applicationId: application.id,
          outcome: ApplicationStatus.APPROVED,
          decidedById: user.id,
          reason: input.reason ?? null,
          publicNote: input.publicNote ?? null,
          snapshot: this.snapshotOf(application),
        },
      });

      const loanNumber = await this.numbers.nextLoanNumber(tx);
      const loan = await tx.loan.create({
        data: {
          number: loanNumber,
          applicationId: application.id,
          borrowerId: application.borrowerId as string,
          status: LoanStatus.APPROVED_UNFUNDED,
          principal,
          frequency,
          periods,
          firstPaymentDate,
          interestMethod: terms.interestMethod ?? null,
          policy,
          policyConfigured: true,
          schedule: {
            create: schedule.map((entry) => ({
              number: entry.number,
              dueDate: entry.dueDate,
              amount: entry.amount,
            })),
          },
        },
      });

      await this.audit.write(
        {
          actorId: user.id,
          action: "application.approve",
          objectType: "Application",
          objectId: application.id,
          before: { status: ApplicationStatus.SUBMITTED, version: input.expectedVersion },
          after: { status: ApplicationStatus.APPROVED, loanId: loan.id, loanNumber: loan.number },
          reason: input.reason ?? null,
        },
        tx,
      );

      return loan;
    });

    await this.notifications.notifyBorrower(
      application.borrowerId as string,
      "Your application was approved",
      `Loan ${result.number} is ready. The office will contact you about disbursement.`,
      "/customer/loans",
    );
    return { outcome: ApplicationStatus.APPROVED, loanId: result.id, loanNumber: result.number };
  }

  private async decline(
    user: AuthUser,
    application: Awaited<ReturnType<DecisionsService["loadForDecision"]>>,
    input: DecisionInput,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.application.updateMany({
        where: {
          id: application.id,
          version: input.expectedVersion,
          status: ApplicationStatus.SUBMITTED,
        },
        data: { status: ApplicationStatus.DECLINED, version: { increment: 1 } },
      });
      if (locked.count === 0) {
        throw conflict("Another decision was recorded first. Reload to see the outcome.");
      }

      await tx.applicationDecision.create({
        data: {
          applicationId: application.id,
          outcome: ApplicationStatus.DECLINED,
          decidedById: user.id,
          // The reason is internal; only publicNote is ever shown to the customer.
          reason: input.reason ?? null,
          publicNote: input.publicNote ?? null,
          snapshot: this.snapshotOf(application),
        },
      });

      await this.audit.write(
        {
          actorId: user.id,
          action: "application.decline",
          objectType: "Application",
          objectId: application.id,
          before: { status: ApplicationStatus.SUBMITTED, version: input.expectedVersion },
          after: { status: ApplicationStatus.DECLINED },
          reason: input.reason ?? null,
        },
        tx,
      );
    });

    await this.notifications.notifyBorrower(
      application.borrowerId as string,
      "Your application was declined",
      input.publicNote?.trim() || "The office declined this application. Contact the team if you have questions.",
      "/customer/applications",
    );
    return { outcome: ApplicationStatus.DECLINED, loanId: null, loanNumber: null };
  }

  private async loadForDecision(applicationId: string) {
    const application = await this.prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        borrower: { select: { id: true, name: true } },
        assets: {
          orderBy: { sortOrder: "asc" },
          include: { photos: true, valuations: true },
        },
        terms: true,
        decisions: true,
        loan: true,
      },
    });
    if (!application) throw notFound("Application not found");
    return application;
  }

  /**
   * The conditions a submitted application must still satisfy at decision time.
   * Mirrors readiness, plus the policy requirement that only matters for funding.
   */
  private preconditions(
    application: Awaited<ReturnType<DecisionsService["loadForDecision"]>>,
  ) {
    const readiness = buildReadiness({
      id: application.id,
      status: application.status,
      borrowerId: application.borrowerId,
      requestedAmount: application.requestedAmount,
      purpose: application.purpose,
      proposedTermMonths: application.proposedTermMonths,
      assets: application.assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        photoCount: asset.photos.length,
        valuationStatus: asset.valuations[0]?.status ?? null,
        valuationAmount:
          asset.valuations[0]?.status === ValuationStatus.COMPLETED
            ? toCents(asset.valuations[0].amount ?? "0")
            : 0,
      })),
      terms: application.terms
        ? {
            firstPaymentDate: application.terms.firstPaymentDate,
            frequency: application.terms.frequency,
            periods: application.terms.periods,
            policyConfigured: application.terms.policyConfigured,
          }
        : null,
    });

    const checks = readiness.map((item) => ({
      id: item.id,
      label: item.label,
      complete: item.complete,
    }));

    checks.push({
      id: "policy",
      label: "Approved calculation policy available",
      complete: Boolean(application.terms?.policyConfigured) && activePolicy() !== null,
    });
    checks.push({
      id: "no-loan",
      label: "No loan created yet",
      complete: application.loan === null,
    });

    return checks;
  }

  private routingOf(
    application: Awaited<ReturnType<DecisionsService["loadForDecision"]>>,
  ) {
    return classifyApproval({
      requestedAmount: application.requestedAmount,
      purpose: application.purpose,
      purposeDescription: application.purposeDescription,
      assetCount: application.assets.length,
    });
  }

  private allowedActions(
    application: Awaited<ReturnType<DecisionsService["loadForDecision"]>>,
    checks: Array<{ id: string; label: string; complete: boolean }>,
    user: AuthUser,
  ): AllowedAction[] {
    const submitted = application.status === ApplicationStatus.SUBMITTED;
    const blocking = checks.filter((check) => !check.complete);
    const manager = isManager(user);
    const approveAllowed = submitted && blocking.length === 0 && manager;
    const declineAllowed = submitted && manager;
    return [
      {
        id: "approve",
        label: "Approve application",
        allowed: approveAllowed,
        ...(approveAllowed
          ? {}
          : {
              reason: !submitted
                ? "Only a submitted application can be approved"
                : blocking.length > 0
                  ? `Waiting on: ${blocking.map((check) => check.label).join(", ")}`
                  : "Only a manager can approve an application",
            }),
      },
      {
        id: "decline",
        label: "Decline application",
        allowed: declineAllowed,
        ...(declineAllowed
          ? {}
          : {
              reason: !submitted
                ? "Only a submitted application can be declined"
                : "Only a manager can decline an application",
            }),
      },
    ];
  }

  /** The exact reviewed state, retained with the decision for later comparison. */
  private snapshotOf(
    application: Awaited<ReturnType<DecisionsService["loadForDecision"]>>,
  ) {
    return {
      applicationId: application.id,
      number: application.number,
      version: application.version,
      status: application.status,
      borrowerId: application.borrowerId,
      borrowerName: application.borrower?.name ?? null,
      requestedAmount: application.requestedAmount,
      purpose: application.purpose,
      purposeDescription: application.purposeDescription,
      proposedTermMonths: application.proposedTermMonths,
      terms: application.terms
        ? {
            firstPaymentDate: application.terms.firstPaymentDate?.toISOString() ?? null,
            frequency: application.terms.frequency,
            periods: application.terms.periods,
            interestMethod: application.terms.interestMethod,
            policyConfigured: application.terms.policyConfigured,
          }
        : null,
      assets: application.assets.map((asset) => ({
        id: asset.id,
        name: asset.name,
        description: asset.description,
        condition: asset.condition,
        photoCount: asset.photos.length,
        valuation: asset.valuations[0]
          ? {
              status: asset.valuations[0].status,
              amount: asset.valuations[0].amount,
              valuationDate: asset.valuations[0].valuationDate?.toISOString() ?? null,
              borrowerPresent: asset.valuations[0].borrowerPresent,
              loanOfficerId: asset.valuations[0].loanOfficerId,
              valuationOfficerId: asset.valuations[0].valuationOfficerId,
              participatedAt: asset.valuations[0].participatedAt?.toISOString() ?? null,
            }
          : null,
      })),
      decidedAt: new Date().toISOString(),
    };
  }
}

/** Narrow helper used when a loan must not accept new money while unsettled. */
export function assertNoOpenAttempts(
  attempts: Array<{ status: PaymentAttemptStatus }>,
): void {
  const unresolved = attempts.filter(
    (attempt) =>
      attempt.status === PaymentAttemptStatus.PENDING ||
      attempt.status === PaymentAttemptStatus.UNKNOWN,
  );
  if (unresolved.length > 0) {
    throw forbidden(
      "An earlier money movement on this loan is unresolved. Check it before recording another.",
    );
  }
}
