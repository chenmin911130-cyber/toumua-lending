import { AuthUser } from "./session";

export const AUTH_USER = "authUser";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      authUser?: AuthUser | null;
      csrfToken?: string;
    }
  }
}
