import { CanActivate, ExecutionContext, Inject, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Permission } from "@toumua/contracts";
import { Request } from "express";
import { forbidden, unauthorized } from "../common/http";

export const IS_PUBLIC = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ALLOW_RESTRICTED = "allowRestricted";
export const AllowRestricted = () => SetMetadata(ALLOW_RESTRICTED, true);

export const REQUIRE_STAFF = "requireStaff";
export const RequireStaff = () => SetMetadata(REQUIRE_STAFF, true);

export const REQUIRE_PERMISSION = "requirePermission";
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRE_PERMISSION, permission);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<Request>();
    if (isPublic) {
      return true;
    }
    if (!req.authUser) {
      throw unauthorized();
    }
    const allowRestricted = this.reflector.getAllAndOverride<boolean>(
      ALLOW_RESTRICTED,
      [context.getHandler(), context.getClass()],
    );
    if (req.authUser.restrictedSession && !allowRestricted) {
      throw forbidden("Verify your email to continue");
    }
    const requireStaff = this.reflector.getAllAndOverride<boolean>(REQUIRE_STAFF, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requireStaff && !req.authUser.isStaff) {
      throw forbidden();
    }
    const permission = this.reflector.getAllAndOverride<Permission>(
      REQUIRE_PERMISSION,
      [context.getHandler(), context.getClass()],
    );
    if (permission && !req.authUser.permissions.includes(permission)) {
      throw forbidden();
    }
    return true;
  }
}
