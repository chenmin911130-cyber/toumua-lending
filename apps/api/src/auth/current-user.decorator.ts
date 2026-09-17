import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";
import { AuthUser } from "./session";
import { unauthorized } from "../common/http";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.authUser) {
      throw unauthorized();
    }
    return req.authUser;
  },
);
