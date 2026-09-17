import { HttpException, HttpStatus } from "@nestjs/common";
import { ErrorCode, FieldErrors } from "@toumua/contracts";

export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    code: string,
    message: string,
    options?: { fieldErrors?: FieldErrors; retryAfterSeconds?: number },
  ) {
    super(
      {
        code,
        message,
        fieldErrors: options?.fieldErrors,
        retryAfterSeconds: options?.retryAfterSeconds,
      },
      status,
    );
  }
}

export const unauthorized = (message = "Sign in to continue") =>
  new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHENTICATED, message);

export const forbidden = (message = "You do not have access to this action") =>
  new ApiException(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, message);

export const notFound = (message = "Not found") =>
  new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, message);

export const conflict = (
  message: string,
  fieldErrors?: FieldErrors,
) =>
  new ApiException(HttpStatus.CONFLICT, ErrorCode.CONFLICT, message, {
    fieldErrors,
  });

export const validation = (message: string, fieldErrors?: FieldErrors) =>
  new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION, message, {
    fieldErrors,
  });

export const rateLimited = (retryAfterSeconds: number, message = "Please wait and try again") =>
  new ApiException(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED, message, {
    retryAfterSeconds,
  });

export const mailUnavailable = () =>
  new ApiException(
    HttpStatus.SERVICE_UNAVAILABLE,
    ErrorCode.MAIL_UNAVAILABLE,
    "The email service is unavailable. The message was not sent.",
  );
