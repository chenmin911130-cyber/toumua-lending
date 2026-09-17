import { BusinessRole, Permission, PublicUser } from "@toumua/contracts";
import { forbidden } from "../common/http";

const LENDING_ROLES = new Set<string>([
  BusinessRole.LOAN_OFFICER,
  BusinessRole.MANAGER,
  BusinessRole.OWNER,
]);

const VALUATION_ROLES = new Set<string>([
  BusinessRole.VALUATION_OFFICER,
  BusinessRole.MANAGER,
  BusinessRole.OWNER,
]);

const MANAGER_ROLES = new Set<string>([BusinessRole.MANAGER, BusinessRole.OWNER]);

export function assertManageLending(user: PublicUser) {
  if (!user.isStaff) throw forbidden();
  if (user.role && LENDING_ROLES.has(user.role)) return;
  if (user.permissions.includes(Permission.MANAGE_STAFF)) return;
  throw forbidden();
}

export function assertManageValuation(user: PublicUser) {
  if (!user.isStaff) throw forbidden();
  if (user.role && VALUATION_ROLES.has(user.role)) return;
  if (user.permissions.includes(Permission.MANAGE_STAFF)) return;
  throw forbidden();
}

export function assertManageAccountLink(user: PublicUser) {
  if (!user.isStaff) throw forbidden();
  if (user.role && LENDING_ROLES.has(user.role)) return;
  if (user.permissions.includes(Permission.MANAGE_STAFF)) return;
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
const CUSTODY_ROLES = new Set<string>([BusinessRole.VALUATION_OFFICER]);
const CASHIER_ROLES = new Set<string>([BusinessRole.CASHIER]);

function assertRole(user: PublicUser, allowed: Set<string>, who: string) {
  if (!user.isStaff) throw forbidden();
  if (user.role && allowed.has(user.role)) return;
  throw forbidden(`Only ${who} can perform this action`);
}

/** Approving or declining a submitted application is a manager decision. */
export function assertDecideApplication(user: PublicUser) {
  assertRole(user, DECISION_ROLES, "a manager");
}

/** Physical custody: intake, inspection, storage moves, return and sale. */
export function assertManageCustody(user: PublicUser) {
  assertRole(user, CUSTODY_ROLES, "a valuation officer");
}

/** Posting money to the ledger is a cashier action. */
export function assertPostMoney(user: PublicUser) {
  assertRole(user, CASHIER_ROLES, "a cashier");
}

/** Reading loans and transactions: lending roles plus cashier and accountant. */
const LEDGER_READ_ROLES = new Set<string>([
  BusinessRole.LOAN_OFFICER,
  BusinessRole.MANAGER,
  BusinessRole.CASHIER,
  BusinessRole.ACCOUNTANT,
]);

export function assertReadLedger(user: PublicUser) {
  if (!user.isStaff) throw forbidden();
  if (user.role && LEDGER_READ_ROLES.has(user.role)) return;
  throw forbidden();
}
