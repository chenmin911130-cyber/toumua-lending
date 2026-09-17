import { Permission, PublicUser, isStaffRole } from "@toumua/contracts";
import { User } from "../generated/prisma";

export const SESSION_COOKIE = "toumua.sid";
export const CSRF_COOKIE = "toumua.csrf";
export const SESSION_DAYS = 14;

export type AuthUser = PublicUser & {
  sessionId: string;
};

export function toPublicUser(
  user: User & { permissions?: { permission: string }[] },
  restrictedSession: boolean,
): PublicUser {
  const permissions = (user.permissions ?? [])
    .map((row) => row.permission)
    .filter((value): value is Permission =>
      value === Permission.MANAGE_STAFF || value === Permission.VIEW_AUDIT,
    );
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    permissions,
    emailVerified: Boolean(user.emailVerifiedAt),
    restrictedSession,
    isStaff: isStaffRole(user.role) || permissions.includes(Permission.MANAGE_STAFF),
  };
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
}

export function csrfCookieOptions() {
  return {
    httpOnly: false,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
}
