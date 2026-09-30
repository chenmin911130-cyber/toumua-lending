import { BusinessRole, Permission, PublicUser } from "@toumua/contracts";
import { forbidden } from "../common/http";

const LENDING_ROLES = new Set<string>([
  BusinessRole.LOAN_OFFICER,
  BusinessRole.MANAGER,
]);

const VALUATION_ROLES = new Set<string>([
  BusinessRole.VALUATION_OFFICER,
  BusinessRole.MANAGER,
]);

const MANAGER_ROLES = new Set<string>([BusinessRole.MANAGER, BusinessRole.OWNER]);

export function assertManageLending(user: PublicUser) {
  if (!user.isStaff) throw forbidden();
  if (user.role && LENDING_ROLES.has(user.role)) return;
  throw forbidden();
}

export function assertManageValuation(user: PublicUser) {
  if (!user.isStaff) throw forbidden();
  if (user.role && VALUATION_ROLES.has(user.role)) return;
  throw forbidden();
}

export function assertManageAccountLink(user: PublicUser) {
  if (!user.isStaff) throw forbidden();
  if (user.role && LENDING_ROLES.has(user.role)) return;
  throw forbidden();
}

export function assertRevokeAccountLink(user: PublicUser) {
  if (!user.isStaff) throw forbidden();
  if (user.role && MANAGER_ROLES.has(user.role)) return;
  if (user.permissions.includes(Permission.MANAGE_STAFF)) return;
  throw forbidden();
}

/**
 * Batch 04 roles. These follow the permission matrix strictly rather than
 * widening `assertManageLending`: the design states that an owner has no
 * approval right, and that the independent `manage_staff` / `view_audit`
 * permissions do not confer business or money authority. Only the named role
 * passes.
 */
const DECISION_ROLES = new Set<string>([BusinessRole.MANAGER]);
const DEFAULT_ROLES = new Set<string>([BusinessRole.MANAGER]);
const CORRECTION_APPROVE_ROLES = new Set<string>([BusinessRole.MANAGER]);
const CUSTODY_ROLES = new Set<string>([BusinessRole.VALUATION_OFFICER]);
const CASHIER_ROLES = new Set<string>([BusinessRole.CASHIER]);

function assertRole(user: PublicUser, allowed: Set<string>, who: string) {
  if (!user.isStaff) throw forbidden();
  if (user.role && allowed.has(user.role)) return;
  throw forbidden(`Only ${who} can perform this action`);
}

const REVIEW_ROLES = new Set<string>([BusinessRole.LOAN_OFFICER, BusinessRole.MANAGER]);

/** Officers and managers may read the review screen; only a manager decides. */
export function assertReviewDecision(user: PublicUser) {
  assertRole(user, REVIEW_ROLES, "a loan officer or manager");
}

/** Approving or declining a submitted application is a manager decision. */
export function assertDecideApplication(user: PublicUser) {
  assertRole(user, DECISION_ROLES, "a manager");
}

export function isManager(user: PublicUser) {
  return user.role === BusinessRole.MANAGER;
}

export function canManageStaffAccounts(user: PublicUser) {
  return (
    isManager(user) ||
    user.role === BusinessRole.OWNER ||
    user.permissions.includes(Permission.MANAGE_STAFF)
  );
}

/** Declaring default on an active loan is a manager decision. */
export function assertDecideDefault(user: PublicUser) {
  assertRole(user, DEFAULT_ROLES, "a manager");
}

/** Cashiers submit correction requests; managers approve them. */
export function assertRequestCorrection(user: PublicUser) {
  assertRole(user, CASHIER_ROLES, "a cashier");
}

export function assertApproveCorrection(user: PublicUser) {
  assertRole(user, CORRECTION_APPROVE_ROLES, "a manager");
}

/** Physical custody: intake, inspection, storage moves, return and sale. */
export function assertManageCustody(user: PublicUser) {
  assertRole(user, CUSTODY_ROLES, "a valuation officer");
}

const STORAGE_LOCATION_ROLES = new Set<string>([
  BusinessRole.MANAGER,
  BusinessRole.VALUATION_OFFICER,
]);

/** Creating and retiring organised storage places. */
export function assertManageStorageLocations(user: PublicUser) {
  assertRole(user, STORAGE_LOCATION_ROLES, "a manager or valuation officer");
}

/** Posting money to the ledger is a cashier action. */
export function assertPostMoney(user: PublicUser) {
  assertRole(user, CASHIER_ROLES, "a cashier");
}

const ACTIVATE_ARRANGEMENT_ROLES = new Set<string>([BusinessRole.CASHIER, BusinessRole.MANAGER]);

/** The office confirms a bank authority before collections can run. */
export function assertActivateArrangement(user: PublicUser) {
  assertRole(user, ACTIVATE_ARRANGEMENT_ROLES, "a cashier or manager");
}

const CANCEL_ARRANGEMENT_ROLES = new Set<string>([
  BusinessRole.LOAN_OFFICER,
  BusinessRole.CASHIER,
  BusinessRole.MANAGER,
]);

/** Staff may cancel an arrangement. The borrower cancels through their own loan. */
export function assertCancelArrangement(user: PublicUser) {
  assertRole(user, CANCEL_ARRANGEMENT_ROLES, "a loan officer, cashier or manager");
}

const COLLECTION_READ_ROLES = new Set<string>([BusinessRole.CASHIER, BusinessRole.MANAGER]);

/** The collections list is for the cashier who posts and the manager who oversees it. */
export function assertReadCollections(user: PublicUser) {
  assertRole(user, COLLECTION_READ_ROLES, "a cashier or manager");
}

/** Reading loans and transactions: lending roles plus cashier and accountant. */
const LEDGER_READ_ROLES = new Set<string>([
  BusinessRole.LOAN_OFFICER,
  BusinessRole.VALUATION_OFFICER,
  BusinessRole.MANAGER,
  BusinessRole.CASHIER,
  BusinessRole.ACCOUNTANT,
  BusinessRole.OWNER,
]);

const BUSINESS_STATUS_ROLES = new Set<string>([
  BusinessRole.OWNER,
  BusinessRole.MANAGER,
  BusinessRole.ACCOUNTANT,
]);

export function assertReadBusinessStatus(user: PublicUser) {
  assertRole(user, BUSINESS_STATUS_ROLES, "an owner, manager or accountant");
}

export function assertReadLedger(user: PublicUser) {
  if (!user.isStaff) throw forbidden();
  if (user.role && LEDGER_READ_ROLES.has(user.role)) return;
  throw forbidden();
}

const RUN_REMINDER_ROLES = new Set<string>([BusinessRole.MANAGER]);

/** Starting the reminder job by hand is a manager action. The morning cron has no actor. */
export function assertRunReminders(user: PublicUser) {
  assertRole(user, RUN_REMINDER_ROLES, "a manager");
}

const SMS_OUTBOX_ROLES = new Set<string>([
  BusinessRole.MANAGER,
  BusinessRole.OWNER,
  BusinessRole.CASHIER,
]);

/** Outbox rows include a masked phone only. Raw numbers stay on the borrower record. */
export function assertReadSmsOutbox(user: PublicUser) {
  assertRole(user, SMS_OUTBOX_ROLES, "a manager, owner or cashier");
}

/** Replacing an unsigned contract after the terms change is a manager action. */
export function assertReissueContract(user: PublicUser) {
  assertRole(user, DECISION_ROLES, "a manager");
}

/** Soft-deleting a stored document is a manager action. */
export function assertDeleteDocument(user: PublicUser) {
  assertRole(user, DECISION_ROLES, "a manager");
}
