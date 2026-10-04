import { BadRequestException } from '@nestjs/common';
import type { ValidationErrorBody } from '@sonrisa/shared';

interface Issue {
  path: PropertyKey[];
  message: string;
}

/** The one 400 shape every validation failure uses (`validationErrorBodySchema` in shared). */
export function validationError(issues: Issue[]): BadRequestException {
  const body: ValidationErrorBody = {
    message: 'Validation failed',
    // zod paths may hold symbols in theory; JSON can't, so name them.
    issues: issues.map(({ path, message }) => ({
      path: path.map((key) => (typeof key === 'symbol' ? String(key) : key)),
      message,
    })),
  };
  return new BadRequestException(body);
}
