import { z } from "zod";
import { BusinessRole, Permission, UserStatus } from "./roles";

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, "Password must be 12–128 characters")
  .max(PASSWORD_MAX, "Password must be 12–128 characters");

export const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .email("Enter a valid email address");

export const registerSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(160),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    role: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

export const resendEmailSchema = z.object({}).strict();

export const changePendingEmailSchema = z.object({
  email: emailSchema,
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Reset token is required"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });

export const inspectInvitationSchema = z.object({
  token: z.string().min(1),
});

export const acceptInvitationSchema = z
  .object({
    token: z.string().min(1),
    name: z.string().trim().min(1).max(160).optional(),
    password: passwordSchema,
    confirmPassword: z.string(),
    role: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.password !== value.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: BusinessRole | null;
  status: UserStatus;
  permissions: Permission[];
  emailVerified: boolean;
  restrictedSession: boolean;
  isStaff: boolean;
};

export type SessionUser = PublicUser;
