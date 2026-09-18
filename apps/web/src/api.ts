import type { ApiErrorBody, PublicUser } from "@toumua/contracts";

let csrfToken: string | null = null;

export class ApiError extends Error {
  constructor(public readonly body: ApiErrorBody, public readonly status: number) {
    super(body.message);
  }
}

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  const response = await fetch("/api/v1/auth/csrf", { credentials: "include" });
  const data = (await response.json()) as { token: string };
  csrfToken = data.token;
  return csrfToken;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  if (!headers.has("content-type") && options.body) {
    headers.set("content-type", "application/json");
  }
  if (method !== "GET" && method !== "HEAD") {
    headers.set("x-csrf-token", await ensureCsrf());
  }
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    credentials: "include",
    headers,
  });
  const data = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new ApiError(
      {
        code: data.code ?? "ERROR",
        message: data.message ?? "Request failed",
        fieldErrors: data.fieldErrors,
        requestId: data.requestId ?? "",
        retryAfterSeconds: data.retryAfterSeconds,
      },
      response.status,
    );
  }
  return data;
}

export function fieldError(error: unknown, name: string): string | undefined {
  if (error instanceof ApiError) {
    return error.body.fieldErrors?.[name]?.[0];
  }
  return undefined;
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.body.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

export type MeResponse = { user: PublicUser };
export async function postIdempotent<T>(
  path: string,
  body: unknown,
  idempotencyKey: string,
): Promise<T> {
  const token = await ensureCsrf();
  const response = await fetch(`/api/v1${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": token,
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new ApiError(
      {
        code: data.code ?? "ERROR",
        message: data.message ?? "Request failed",
        fieldErrors: data.fieldErrors,
        requestId: data.requestId ?? "",
      },
      response.status,
    );
  }
  return data;
}

export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const token = await ensureCsrf();
  const body = new FormData();
  body.append("file", file);
  const response = await fetch(`/api/v1${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "x-csrf-token": token },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as T & ApiErrorBody;
  if (!response.ok) {
    throw new ApiError(
      {
        code: data.code ?? "ERROR",
        message: data.message ?? "Upload failed",
        fieldErrors: data.fieldErrors,
        requestId: data.requestId ?? "",
      },
      response.status,
    );
  }
  return data;
}

export type ContactResponse = {
  phone: string | null;
  email: string | null;
  address: string | null;
  hours: string | null;
  note: string | null;
};
