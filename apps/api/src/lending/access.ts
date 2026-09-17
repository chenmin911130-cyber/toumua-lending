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
