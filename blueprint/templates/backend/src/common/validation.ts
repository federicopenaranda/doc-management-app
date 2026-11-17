import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

/** Parses a request body; on failure a 400 with one error per problem, each naming its field. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException({
      errors: parsed.error.issues.map((issue) => {
        const field = issue.path.join('.');
        return field
          ? { field, message: issue.message }
          : { message: issue.message };
      }),
    });
  }
  return parsed.data;
}
