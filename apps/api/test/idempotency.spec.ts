import { describe, expect, it } from "vitest";
import {
  IdempotencyConflict,
  hashRequest,
  resolveExistingAttempt,
} from "../src/lending/idempotency";

const body = { amount: "100.00", businessDate: "2026-10-01", method: "CASH" };
const identity = { loanId: "loan-1", type: "REPAYMENT" as const, initiatedById: "user-1" };

function existing(overrides: Record<string, unknown> = {}) {
  return {
    id: "attempt-1",
    loanId: "loan-1",
    type: "REPAYMENT",
    initiatedById: "user-1",
    requestHash: hashRequest(body),
    status: "COMMITTED",
    ledgerEntryId: "ledger-1",
    failureReason: null,
    ...overrides,
  };
}

describe("idempotency attempt identity", () => {
  it("replays only when loan, type, actor and body all match", () => {
    expect(resolveExistingAttempt(existing(), hashRequest(body), identity)).toEqual({
      kind: "replay",
      attemptId: "attempt-1",
      ledgerEntryId: "ledger-1",
    });
  });

  it("refuses a key bound to a different loan even with the same body", () => {
    expect(() =>
      resolveExistingAttempt(existing({ loanId: "loan-2" }), hashRequest(body), identity),
    ).toThrow(IdempotencyConflict);
  });

  it("refuses a key bound to a different operation", () => {
    expect(() =>
      resolveExistingAttempt(existing({ type: "DISBURSEMENT" }), hashRequest(body), identity),
    ).toThrow(IdempotencyConflict);
  });

  it("refuses a key first used by another actor", () => {
    expect(() =>
      resolveExistingAttempt(existing({ initiatedById: "user-2" }), hashRequest(body), identity),
    ).toThrow(IdempotencyConflict);
  });

  it("refuses the same resource and actor with a different body", () => {
    expect(() =>
      resolveExistingAttempt(existing(), hashRequest({ amount: "200.00" }), identity),
    ).toThrow(IdempotencyConflict);
  });

  it("still reports an unresolved attempt rather than replaying it", () => {
    expect(
      resolveExistingAttempt(existing({ status: "PENDING" }), hashRequest(body), identity),
    ).toEqual({ kind: "unresolved", attemptId: "attempt-1", status: "PENDING" });
  });

  it("still reports an unknown attempt rather than replaying it", () => {
    expect(
      resolveExistingAttempt(existing({ status: "UNKNOWN" }), hashRequest(body), identity),
    ).toEqual({ kind: "unresolved", attemptId: "attempt-1", status: "UNKNOWN" });
  });
});
