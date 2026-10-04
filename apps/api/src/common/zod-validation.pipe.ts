import type { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { validationError } from './validation-error.js';

/**
 * Validates a request body (or param) with a shared zod schema and returns the parsed output,
 * so controllers only ever see data that passed the same schema the frontend uses.
 */
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw validationError(result.error.issues.map(({ path, message }) => ({ path, message })));
    }
    return result.data;
  }
}
