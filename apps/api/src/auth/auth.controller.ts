import { Body, Controller, Get, Inject, Post, Query, Req, Res } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  acceptInvitationSchema,
  changePasswordSchema,
  changePendingEmailSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@toumua/contracts";
import { Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuthService } from "./auth.service";
import { AllowRestricted, Public } from "./auth.guard";
import { CurrentUser } from "./current-user.decorator";
import {
  AuthUser,
  CSRF_COOKIE,
  SESSION_COOKIE,
  cookieOptions,
  csrfCookieOptions,
} from "./session";
import { randomToken } from "../common/ids";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Get("csrf")
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[CSRF_COOKIE] ?? randomToken(16);
    if (!req.cookies?.[CSRF_COOKIE]) {
      res.cookie(CSRF_COOKIE, token, csrfCookieOptions());
    }
    return { token };
  }

  @Public()
  @Post("register")
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(body as never);
    this.setSession(res, result.session.token);
    return { user: result.user };
  }

  @Public()
  @Post("login")
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(body as never);
    this.setSession(res, result.session.token);
    return { user: result.user };
  }

  @AllowRestricted()
  @Post("logout")
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.revokeSession(user.sessionId);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { loggedOut: true };
  }

  @AllowRestricted()
  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return { user };
  }

  @Public()
  @Post("email/verify")
  async verify(@Body(new ZodValidationPipe(verifyEmailSchema)) body: { token: string }) {
    return this.auth.verifyEmail(body.token);
  }

  @AllowRestricted()
  @Post("email/resend")
  resend(@CurrentUser() user: AuthUser) {
    return this.auth.resendVerification(user.id);
  }

  @AllowRestricted()
  @Post("email/change-pending")
  changePending(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePendingEmailSchema)) body: { email: string },
  ) {
    return this.auth.changePendingEmail(user.id, body.email);
  }

  @Public()
  @Post("password/forgot")
  forgot(@Body(new ZodValidationPipe(forgotPasswordSchema)) body: { email: string }) {
    return this.auth.forgotPassword(body.email);
  }

  @Public()
  @Post("password/reset")
  reset(@Body(new ZodValidationPipe(resetPasswordSchema)) body: unknown) {
    return this.auth.resetPassword(body as never);
  }

  @Post("password/change")
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: unknown,
  ) {
    return this.auth.changePassword(user.id, body as never);
  }

  @Public()
  @Get("invitations/inspect")
  inspect(@Query("token") token: string) {
    return this.auth.inspectInvitation(token ?? "");
  }

  @Public()
  @Post("invitations/accept")
  accept(@Body(new ZodValidationPipe(acceptInvitationSchema)) body: unknown) {
    return this.auth.acceptInvitation(body as never);
  }

  private setSession(res: Response, token: string) {
    res.cookie(SESSION_COOKIE, token, cookieOptions());
  }
}
