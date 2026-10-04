import { z } from 'zod';

/** One problem with a request field; `path` points into the body, e.g. `['config', 'webhookUrl']`. */
export const validationIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

/** The one 400 body every validation failure uses (zod pipe, Channel config, rule destinations). */
export const validationErrorBodySchema = z.object({
  message: z.literal('Validation failed'),
  issues: z.array(validationIssueSchema),
});
export type ValidationErrorBody = z.infer<typeof validationErrorBodySchema>;
