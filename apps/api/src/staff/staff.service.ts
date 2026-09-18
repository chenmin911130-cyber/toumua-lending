import { Inject, Injectable } from "@nestjs/common";
import {
  ChangePermissionsInput,
  ChangeRoleInput,
  ChangeStatusInput,
  InviteStaffInput,
  Permission,
  StaffAccount,
  normalizeEmail,
} from "@toumua/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { AuditService } from "../audit/audit.service";
import { conflict, forbidden, notFound, validation } from "../common/http";
import { AuthUser } from "../auth/session";
import { canManageStaffAccounts } from "../lending/access";

@Injectable()
export class StaffService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(actor: AuthUser): Promise<{ items: StaffAccount[]; nextCursor: null; total: number }> {
    this.assertManageStaff(actor);
    const users = await this.prisma.user.findMany({
      where: {
        OR: [
          { role: { not: "CUSTOMER" } },
          { permissions: { some: { permission: Permission.MANAGE_STAFF } } },
        ],
      },
      include: { permissions: true, receivedInvitation: true },
      orderBy: { createdAt: "desc" },
    });
    const items = users.map((user) => this.toAccount(user));
    return { items, nextCursor: null, total: items.length };
  }

  async get(id: string): Promise<StaffAccount> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { permissions: true, receivedInvitation: true },
    });
    if (!user || user.role === "CUSTOMER") {
      throw notFound();
    }
    return this.toAccount(user);
  }

  async invite(actor: AuthUser, input: InviteStaffInput): Promise<StaffAccount> {
    this.assertManageStaff(actor);
    const emailNormalized = normalizeEmail(input.email);
    const existing = await this.prisma.user.findUnique({
      where: { emailNormalized },
      include: { permissions: true, receivedInvitation: true },
    });
    if (existing && existing.status !== "INVITATION_REVOKED") {
      throw conflict("This email cannot be invited", {
        email: ["This email cannot be invited"],
      });
    }
    const user = existing
      ? await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            name: input.name,
            role: input.role,
            status: "INVITED",
            passwordHash: null,
            emailVerifiedAt: null,
          },
        })
      : await this.prisma.user.create({
          data: {
            email: input.email.trim(),
            emailNormalized,
            name: input.name,
            role: input.role,
            status: "INVITED",
          },
        });

    const expiresAt = new Date(Date.now() + this.auth.inviteTtlMs());
    await this.prisma.invitation.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        invitedById: actor.id,
        role: input.role,
        email: user.email,
        expiresAt,
      },
      update: {
        invitedById: actor.id,
        role: input.role,
        email: user.email,
        expiresAt,
        acceptedAt: null,
        revokedAt: null,
      },
    });
    await this.auth.issueInvitationToken(user, input.role);
    await this.audit.write({
      actorId: actor.id,
      action: "staff.invited",
      objectType: "user",
      objectId: user.id,
      after: { email: user.email, role: input.role },
      reason: "Staff invitation",
    });
    return this.get(user.id);
  }

  async changeRole(actor: AuthUser, id: string, input: ChangeRoleInput) {
    this.assertManageStaff(actor);
    if (actor.id === id) {
      throw forbidden("You cannot change your own role");
    }
    const user = await this.requireStaff(id);
    await this.prisma.user.update({
      where: { id },
      data: { role: input.role },
    });
    await this.auth.revokeAllSessions(id);
    await this.audit.write({
      actorId: actor.id,
      action: "staff.role_changed",
      objectType: "user",
      objectId: id,
      before: { role: user.role },
      after: { role: input.role },
      reason: input.reason,
    });
    return this.get(id);
  }

  async changePermissions(
    actor: AuthUser,
    id: string,
    input: ChangePermissionsInput,
  ) {
    this.assertManageStaff(actor);
    if (actor.id === id) {
      throw forbidden("You cannot change your own permissions");
    }
    const user = await this.requireStaffUser(id);
    const current = user.permissions.map((row) => row.permission);
    if (
      current.includes(Permission.MANAGE_STAFF) &&
      !input.permissions.includes(Permission.MANAGE_STAFF)
    ) {
      await this.assertNotLastAdmin(id);
    }
    await this.prisma.$transaction([
      this.prisma.staffPermission.deleteMany({ where: { userId: id } }),
      ...input.permissions.map((permission) =>
        this.prisma.staffPermission.create({
          data: { userId: id, permission },
        }),
      ),
    ]);
    await this.auth.revokeAllSessions(id);
    await this.audit.write({
      actorId: actor.id,
      action: "staff.permissions_changed",
      objectType: "user",
      objectId: id,
      before: { permissions: current },
      after: { permissions: input.permissions },
      reason: input.reason,
    });
    return this.get(id);
  }

  async changeStatus(actor: AuthUser, id: string, input: ChangeStatusInput) {
    this.assertManageStaff(actor);
    if (actor.id === id) {
      throw forbidden("You cannot change your own account status");
    }
    const user = await this.requireStaffUser(id);
    if (input.status === "INACTIVE") {
      if (user.status === "INVITED") {
        throw validation("Deactivate is for active staff accounts");
      }
      await this.assertNotLastAdmin(id);
    }
    if (input.status === "INVITATION_REVOKED") {
      if (user.status !== "INVITED") {
        throw validation("Only pending invitations can be revoked");
      }
      await this.prisma.invitation.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.prisma.verificationToken.updateMany({
        where: { userId: id, type: "INVITATION", usedAt: null },
        data: { usedAt: new Date() },
      });
    }
    if (input.status === "ACTIVE" && user.status !== "INACTIVE") {
      throw validation("Only inactive accounts can be reactivated");
    }
    await this.prisma.user.update({
      where: { id },
      data: { status: input.status },
    });
    await this.auth.revokeAllSessions(id);
    await this.audit.write({
      actorId: actor.id,
      action: "staff.status_changed",
      objectType: "user",
      objectId: id,
      before: { status: user.status },
      after: { status: input.status },
      reason: input.reason,
    });
    return this.get(id);
  }

  async resendInvitation(actor: AuthUser, id: string) {
    this.assertManageStaff(actor);
    const user = await this.requireStaffUser(id);
    if (user.status !== "INVITED") {
      throw validation("Active staff cannot be sent another invitation");
    }
    await this.auth.issueInvitationToken(user, user.role ?? "staff");
    await this.audit.write({
      actorId: actor.id,
      action: "staff.invitation_resent",
      objectType: "user",
      objectId: id,
    });
    return { sent: true };
  }

  private assertManageStaff(actor: AuthUser) {
    if (!canManageStaffAccounts(actor)) {
      throw forbidden();
    }
  }

  private async requireStaff(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.role === "CUSTOMER") {
      throw notFound();
    }
    return user;
  }

  private async requireStaffUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { permissions: true, receivedInvitation: true },
    });
    if (!user || (user.role === "CUSTOMER" && user.permissions.length === 0)) {
      throw notFound();
    }
    return user;
  }

  private async assertNotLastAdmin(excludeUserId: string) {
    const count = await this.prisma.staffPermission.count({
      where: {
        permission: Permission.MANAGE_STAFF,
        user: { status: "ACTIVE", id: { not: excludeUserId } },
      },
    });
    if (count === 0) {
      throw conflict("The last account administrator cannot be removed");
    }
  }

  private toAccount(user: {
    id: string;
    name: string;
    email: string;
    role: StaffAccount["role"] | "CUSTOMER" | null;
    status: string;
    permissions: { permission: string }[];
    receivedInvitation: { createdAt: Date } | null;
    lastLoginAt: Date | null;
    emailVerifiedAt: Date | null;
  }): StaffAccount {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role === "CUSTOMER" ? null : user.role,
      status: user.status,
      permissions: user.permissions.map((row) => row.permission),
      invitedAt: user.receivedInvitation?.createdAt.toISOString() ?? null,
      activatedAt: user.emailVerifiedAt?.toISOString() ?? null,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }
}
