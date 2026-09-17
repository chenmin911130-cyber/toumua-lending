import { PipeTransform } from "@nestjs/common";
import { ZodSchema } from "zod";
import { validation } from "./http";

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) {
      return result.data;
    }
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_root";
      fieldErrors[key] ??= [];
      fieldErrors[key].push(issue.message);
    }
    throw validation("Check the highlighted fields", fieldErrors);
  }
}
