import { z } from "zod";
import { Permission, StaffBusinessRole } from "./roles";

const staffRoleEnum = z.enum([
  StaffBusinessRole.LOAN_OFFICER,
  StaffBusinessRole.VALUATION_OFFICER,
  StaffBusinessRole.MANAGER,
  StaffBusinessRole.CASHIER,
  StaffBusinessRole.ACCOUNTANT,
  StaffBusinessRole.OWNER,
]);

const permissionEnum = z.enum([Permission.MANAGE_STAFF, Permission.VIEW_AUDIT]);

export const inviteStaffSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  email: z.string().trim().email("Enter a valid email address").max(254),
  role: staffRoleEnum,
});

export const changeRoleSchema = z.object({
  role: staffRoleEnum,
  reason: z.string().trim().min(1, "Reason is required").max(2000),
});

export const changePermissionsSchema = z.object({
  permissions: z.array(permissionEnum),
  reason: z.string().trim().min(1, "Reason is required").max(2000),
});

export const changeStatusSchema = z.object({
  status: z.enum(["ACTIVE", "INACTIVE", "INVITATION_REVOKED"]),
  reason: z.string().trim().min(1, "Reason is required").max(2000),
});

export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
export type ChangePermissionsInput = z.infer<typeof changePermissionsSchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

export type StaffAccount = {
  id: string;
  name: string;
  email: string;
  role: StaffBusinessRole | null;
  status: string;
  permissions: string[];
  invitedAt: string | null;
  activatedAt: string | null;
  lastLoginAt: string | null;
};

export type AuditEvent = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  objectType: string;
  objectId: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: string;
};
