export const BusinessRole = {
  CUSTOMER: "CUSTOMER",
  LOAN_OFFICER: "LOAN_OFFICER",
  VALUATION_OFFICER: "VALUATION_OFFICER",
  MANAGER: "MANAGER",
  CASHIER: "CASHIER",
  ACCOUNTANT: "ACCOUNTANT",
  OWNER: "OWNER",
} as const;

export type BusinessRole = (typeof BusinessRole)[keyof typeof BusinessRole];

export const StaffBusinessRole = {
  LOAN_OFFICER: BusinessRole.LOAN_OFFICER,
  VALUATION_OFFICER: BusinessRole.VALUATION_OFFICER,
  MANAGER: BusinessRole.MANAGER,
  CASHIER: BusinessRole.CASHIER,
  ACCOUNTANT: BusinessRole.ACCOUNTANT,
  OWNER: BusinessRole.OWNER,
} as const;

export type StaffBusinessRole =
  (typeof StaffBusinessRole)[keyof typeof StaffBusinessRole];

export const Permission = {
  MANAGE_STAFF: "manage_staff",
  VIEW_AUDIT: "view_audit",
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const UserStatus = {
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  ACTIVE: "ACTIVE",
  INVITED: "INVITED",
  INACTIVE: "INACTIVE",
  INVITATION_REVOKED: "INVITATION_REVOKED",
} as const;

export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const STAFF_ROLES: StaffBusinessRole[] = Object.values(StaffBusinessRole);

export function isStaffRole(role: string | null | undefined): boolean {
  return role != null && role !== BusinessRole.CUSTOMER;
}

export function normalizeEmail(email: string): string {
  return email.normalize("NFKC").toLowerCase();
}
