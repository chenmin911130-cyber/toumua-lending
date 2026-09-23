import { createHash } from "node:crypto";
import { PaymentAttemptStatus } from "@toumua/contracts";
import { Prisma } from "../generated/prisma";
import { conflict } from "../common/http";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Money idempotency.
 *
 * Every money intent carries an Idempotency-Key. The server persists the key
 * together with a hash of the request body, so:
 *
 *   - the same key with the same body returns the original result instead of
 *     posting a second transaction ("the network dropped my response");
 *   - the same key with a different body is a conflict, because the caller is
 *     asking for something the original key never represented;
 *   - a key that is still PENDING or UNKNOWN blocks a duplicate, since an
 *     unresolved intent might already have moved money.
 *
 * PENDING and UNKNOWN are deliberately never treated as failure: a timeout is
 * not evidence that nothing happened.
 */

/** Order-independent, value-stable hash of the business content of a request. */
export function hashRequest(body: Record<string, unknown>): string {
  const canonical = JSON.stringify(body, Object.keys(body).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

export class IdempotencyConflict extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type AttemptLookup =
  | { kind: "absent" }
  | { kind: "replay"; attemptId: string; ledgerEntryId: string | null }
  | { kind: "unresolved"; attemptId: string; status: PaymentAttemptStatus }
  | { kind: "rejected"; attemptId: string; reason: string | null };

/**
 * The business identity of a money intent. A key is bound to the loan, the
 * operation and the staff member who first used it, not just to the request
 * body. Without this, a key could replay another loan's or another user's
 * receipt while the hashes happened to match.
 */
export type AttemptIdentity = {
  loanId: string;
  type: "DISBURSEMENT" | "REPAYMENT" | "SALE_RECEIPT";
  initiatedById: string;
};

export function resolveExistingAttempt(
  existing: {
    id: string;
    loanId: string;
    type: string;
    initiatedById: string;
    requestHash: string;
    status: string;
    ledgerEntryId: string | null;
    failureReason: string | null;
  } | null,
  requestHash: string,
  identity: AttemptIdentity,
): AttemptLookup {
  if (!existing) return { kind: "absent" };

  // Check the resource and actor before the hash. A key must never be accepted
  // as a replay for a different loan or payment type just because the body
  // hashes the same, and one staff member must not collect another's receipt.
  if (existing.loanId !== identity.loanId || existing.type !== identity.type) {
    throw new IdempotencyConflict(
      "This idempotency key was already used for a different loan or payment type. Use a new key for a different payment.",
    );
  }
  if (existing.initiatedById !== identity.initiatedById) {
    throw new IdempotencyConflict(
      "This idempotency key was already used by another user. Use a new key for your own payment.",
    );
  }

  if (existing.requestHash !== requestHash) {
    throw new IdempotencyConflict(
      "This idempotency key was already used for a different request. Use a new key for a different payment.",
    );
  }

  if (existing.status === PaymentAttemptStatus.COMMITTED) {
    return { kind: "replay", attemptId: existing.id, ledgerEntryId: existing.ledgerEntryId };
  }
  if (existing.status === PaymentAttemptStatus.REJECTED) {
    return { kind: "rejected", attemptId: existing.id, reason: existing.failureReason };
  }
  return {
    kind: "unresolved",
    attemptId: existing.id,
    status: existing.status as PaymentAttemptStatus,
  };
}

export type AttemptStart =
  | { kind: "new"; attemptId: string }
  | { kind: "replay"; attemptId: string; ledgerEntryId: string | null };

/** Short-circuit before loan-state checks when the key already committed. */
export function inspectIdempotencyKey(
  existing: {
    id: string;
    loanId: string;
    type: string;
    initiatedById: string;
    requestHash: string;
    status: string;
    ledgerEntryId: string | null;
    failureReason: string | null;
  } | null,
  body: Record<string, unknown>,
  identity: AttemptIdentity,
): { action: "proceed" } | { action: "replay"; attemptId: string } {
  let lookup: AttemptLookup;
  try {
    lookup = resolveExistingAttempt(existing, hashRequest(body), identity);
  } catch (error) {
    if (error instanceof IdempotencyConflict) {
      throw conflict(error.message);
    }
    throw error;
  }
  if (lookup.kind === "absent") return { action: "proceed" };
  if (lookup.kind === "replay") {
    return { action: "replay", attemptId: lookup.attemptId };
  }
  if (lookup.kind === "unresolved") {
    throw conflict(
      lookup.status === PaymentAttemptStatus.UNKNOWN
        ? "An earlier attempt with this key has an unknown result. Check it before retrying rather than sending a new one."
        : "An attempt with this key is still in progress.",
    );
  }
  throw conflict(
    `This attempt was rejected and posted nothing${lookup.reason ? `: ${lookup.reason}` : ""}. Correct the request and submit it with a new key.`,
  );
}

/**
 * Creates the attempt row, or reports the existing one. Relies on the unique
 * index on `idempotencyKey`, so two simultaneous identical requests cannot both
 * create an attempt.
 *
 * Throws for the two cases a caller must not silently proceed through: the same
 * key with a different body, and a key whose earlier attempt is unresolved.
 */
function attemptLookupToStart(lookup: AttemptLookup): AttemptStart {
  if (lookup.kind === "replay") {
    return { kind: "replay", attemptId: lookup.attemptId, ledgerEntryId: lookup.ledgerEntryId };
  }
  if (lookup.kind === "unresolved") {
    throw conflict(
      lookup.status === PaymentAttemptStatus.UNKNOWN
        ? "An earlier attempt with this key has an unknown result. Check it before retrying rather than sending a new one."
        : "An attempt with this key is still in progress.",
    );
  }
  if (lookup.kind === "rejected") {
    // A rejected attempt posted nothing, so the caller may correct and retry.
    throw conflict(
      `This attempt was rejected and posted nothing${lookup.reason ? `: ${lookup.reason}` : ""}. Correct the request and submit it with a new key.`,
    );
  }
  throw conflict("This idempotency key is already in use. Reload before retrying.");
}

/** Turn an idempotency conflict into the HTTP 409 the API should return. */
function safeResolveAttempt(
  existing: Parameters<typeof resolveExistingAttempt>[0],
  requestHash: string,
  identity: AttemptIdentity,
): AttemptLookup {
  try {
    return resolveExistingAttempt(existing, requestHash, identity);
  } catch (error) {
    if (error instanceof IdempotencyConflict) throw conflict(error.message);
    throw error;
  }
}

/**
 * Postgres aborts the transaction on a unique-key violation, so the loser of a
 * create race cannot read the winning row from this transaction. Returning a
 * conflict is safe: it never hands back another resource's receipt and the
 * caller can retry to receive the stored result. The upfront inspection still
 * performs the full loan/type/actor comparison on committed rows.
 */
function attemptCreateRaceConflict(): never {
  throw conflict("An attempt with this key is already being processed. Retry to get its result.");
}

export async function beginAttempt(
  tx: Prisma.TransactionClient,
  input: {
    idempotencyKey: string;
    type: "DISBURSEMENT" | "REPAYMENT" | "SALE_RECEIPT";
    loanId: string;
    initiatedById: string;
    body: Record<string, unknown>;
  },
): Promise<AttemptStart> {
  const requestHash = hashRequest(input.body);
  const identity: AttemptIdentity = {
    loanId: input.loanId,
    type: input.type,
    initiatedById: input.initiatedById,
  };
  const existing = await tx.paymentAttempt.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });

  const lookup = safeResolveAttempt(existing, requestHash, identity);
  if (lookup.kind === "absent") {
    try {
      const created = await tx.paymentAttempt.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          type: input.type,
          loanId: input.loanId,
          initiatedById: input.initiatedById,
          requestHash,
          requestBody: input.body as Prisma.InputJsonValue,
          status: PaymentAttemptStatus.PENDING,
        },
      });
      return { kind: "new", attemptId: created.id };
    } catch (error) {
      // Two simultaneous requests can both read "absent" and race to insert.
      // The unique key lets exactly one win; the loser must resolve the winner
      // with the full identity check rather than surfacing a raw database error.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        attemptCreateRaceConflict();
      }
      throw error;
    }
  }

  return attemptLookupToStart(lookup);
}

/** Reads an attempt for the G01 recovery screen, including its receipt if posted. */
export async function describeAttempt(
  client: Prisma.TransactionClient | PrismaService,
  attemptId: string,
  userId: string,
  canSeeAll: boolean,
) {
  const attempt = await client.paymentAttempt.findUnique({
    where: { id: attemptId },
    include: {
      loan: { select: { id: true, number: true } },
      initiatedBy: { select: { id: true, name: true } },
    },
  });
  if (!attempt) return null;
  // A cashier may only inspect their own unresolved intents.
  if (!canSeeAll && attempt.initiatedById !== userId) return null;

  let receiptId: string | null = null;
  if (attempt.ledgerEntryId) {
    const receipt = await client.receipt.findUnique({
      where: { ledgerEntryId: attempt.ledgerEntryId },
      select: { id: true },
    });
    receiptId = receipt?.id ?? null;
  }

  return {
    id: attempt.id,
    type: attempt.type,
    status: attempt.status,
    loanId: attempt.loanId,
    loanNumber: attempt.loan.number,
    requestBody: attempt.requestBody as Record<string, unknown>,
    failureReason: attempt.failureReason,
    ledgerEntryId: attempt.ledgerEntryId,
    receiptId,
    committedAt: attempt.committedAt?.toISOString() ?? null,
    createdAt: attempt.createdAt.toISOString(),
  };
}
