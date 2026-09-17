import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";
import { forbidden } from "../common/http";
import { CSRF_COOKIE } from "./session";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE.has(req.method)) {
      return true;
    }
    const header = req.header("x-csrf-token");
    const cookie = req.cookies?.[CSRF_COOKIE];
    if (!header || !cookie || header !== cookie) {
      throw forbidden("CSRF token missing or invalid");
    }
    return true;
  }
}
