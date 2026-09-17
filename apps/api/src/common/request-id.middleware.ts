import { NextFunction, Request, Response } from "express";
import { requestId } from "./ids";

export function requestIdMiddleware(
  req: Request & { requestId?: string },
  res: Response,
  next: NextFunction,
): void {
  const header = req.header("x-request-id");
  const id = header && header.length <= 64 ? header : requestId();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}
