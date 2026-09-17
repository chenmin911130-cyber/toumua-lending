import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { ErrorCode } from "@toumua/contracts";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = request.requestId ?? "unknown";

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: string = ErrorCode.SERVICE_UNAVAILABLE;
    let message = "Something went wrong";
    let fieldErrors: Record<string, string[]> | undefined;
    let retryAfterSeconds: number | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();
      if (typeof payload === "string") {
        message = payload;
      } else if (typeof payload === "object" && payload) {
        const body = payload as Record<string, unknown>;
        code = typeof body.code === "string" ? body.code : mapStatus(status);
        message = typeof body.message === "string" ? body.message : message;
        fieldErrors = body.fieldErrors as Record<string, string[]> | undefined;
        retryAfterSeconds =
          typeof body.retryAfterSeconds === "number"
            ? body.retryAfterSeconds
            : undefined;
      }
    } else {
      this.logger.error(
        `Unhandled error requestId=${requestId}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (retryAfterSeconds) {
      response.setHeader("Retry-After", String(retryAfterSeconds));
    }

    response.status(status).json({
      code,
      message,
      fieldErrors,
      requestId,
      retryAfterSeconds,
    });
  }
}

function mapStatus(status: number): string {
  if (status === 401) return ErrorCode.UNAUTHENTICATED;
  if (status === 403) return ErrorCode.FORBIDDEN;
  if (status === 404) return ErrorCode.NOT_FOUND;
  if (status === 409) return ErrorCode.CONFLICT;
  if (status === 422) return ErrorCode.VALIDATION;
  if (status === 429) return ErrorCode.RATE_LIMITED;
  if (status === 503) return ErrorCode.SERVICE_UNAVAILABLE;
  return ErrorCode.SERVICE_UNAVAILABLE;
}
