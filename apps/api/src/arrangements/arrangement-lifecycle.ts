import { Prisma } from "../generated/prisma";
import { AuditService } from "../audit/audit.service";

/** Stops future collections when the loan is no longer collectable. Same transaction as the loan change. */
export async function cancelOpenArrangements(
  tx: Prisma.TransactionClient,
  audit: AuditService,
  input: { loanId: string; reason: string; actorId: string | null },
) {
  const rows = await tx.repaymentArrangement.findMany({
    where: { loanId: input.loanId, status: { in: ["REQUESTED", "ACTIVE"] } },
  });
  for (const row of rows) {
    await tx.repaymentArrangement.update({
      where: { id: row.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: input.reason },
    });
    await audit.write(
      {
        actorId: input.actorId,
        action: "arrangement.cancel",
        objectType: "RepaymentArrangement",
        objectId: row.id,
        reason: input.reason,
        after: { status: "CANCELLED", loanId: input.loanId },
      },
      tx,
    );
  }
}

export function collectionKey(arrangementId: string, scheduleEntryId: string, date: string) {
  return `auto:${arrangementId}:${scheduleEntryId}:${date}`;
}

export function lastFourDigits(accountNumber: string) {
  const digits = accountNumber.replace(/\D/g, "");
  return digits.slice(-4);
}
