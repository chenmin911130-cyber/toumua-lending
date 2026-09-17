import { z } from "zod";

export const cursorListQuerySchema = z.object({
  q: z.string().max(160).optional(),
  status: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sort: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export type CursorListQuery = z.infer<typeof cursorListQuerySchema>;

export type CursorListResponse<T> = {
  items: T[];
  nextCursor: string | null;
  total: number;
};

export const emptyList = <T>(): CursorListResponse<T> => ({
  items: [],
  nextCursor: null,
  total: 0,
});

export const contactConfigSchema = z.object({
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  hours: z.string().nullable(),
  note: z.string().nullable(),
});

export type ContactConfig = z.infer<typeof contactConfigSchema>;
