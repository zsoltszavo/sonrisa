import { BadRequestException } from '@nestjs/common';

export interface ValidationIssue {
  path: PropertyKey[];
  message: string;
}

/** The one 400 shape every validation failure uses (pipe, Channel config, rule destinations). */
export function validationError(issues: ValidationIssue[]): BadRequestException {
  return new BadRequestException({ message: 'Validation failed', issues });
}
