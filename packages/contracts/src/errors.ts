export const ErrorCode = {
  UNAUTHENTICATED: "UNAUTHENTICATED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  VALIDATION: "VALIDATION",
  RATE_LIMITED: "RATE_LIMITED",
  MAIL_UNAVAILABLE: "MAIL_UNAVAILABLE",
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type FieldErrors = Record<string, string[]>;

export type ApiErrorBody = {
  code: ErrorCode | string;
  message: string;
  fieldErrors?: FieldErrors;
  requestId: string;
  retryAfterSeconds?: number;
};
