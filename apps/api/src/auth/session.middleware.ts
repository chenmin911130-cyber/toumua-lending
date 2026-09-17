import { Inject, Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { AuthService } from "./auth.service";
import { CSRF_COOKIE, SESSION_COOKIE, csrfCookieOptions } from "./session";
import { randomToken } from "../common/ids";

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (!req.cookies?.[CSRF_COOKIE]) {
      const csrf = randomToken(16);
      res.cookie(CSRF_COOKIE, csrf, csrfCookieOptions());
      req.csrfToken = csrf;
    } else {
      req.csrfToken = req.cookies[CSRF_COOKIE];
    }

    const raw = req.cookies?.[SESSION_COOKIE];
    const resolved = await this.auth.resolveSession(raw);
    req.authUser = resolved
      ? { ...resolved.user, sessionId: resolved.session.id }
      : null;
    next();
  }
}
