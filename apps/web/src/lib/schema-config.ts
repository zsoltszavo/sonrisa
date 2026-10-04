import { z } from 'zod';

/**
 * Renders a Channel's destination config form from the JSON Schema that GET /channels sends (D11),
 * so a new Channel needs no frontend change. Only the subset our providers use is supported:
 * an object of string properties with optional title, description, format, length and pattern.
 * Anything else is refused loudly instead of rendering a half-working form.
 */
const stringPropertySchema = z.object({
  type: z.literal('string'),
  title: z.string().optional(),
  description: z.string().optional(),
  format: z.string().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().positive().optional(),
  pattern: z.string().optional(),
});

const objectSchema = z.object({
  type: z.literal('object'),
  properties: z.record(z.string(), stringPropertySchema),
  required: z.array(z.string()).default([]),
});

export interface ConfigField {
  name: string;
  label: string;
  description?: string;
  inputType: 'email' | 'url' | 'text';
  required: boolean;
  property: z.infer<typeof stringPropertySchema>;
}

export type ConfigValues = Record<string, string>;

export function configFields(schema: unknown): ConfigField[] | null {
  const parsed = objectSchema.safeParse(schema);
  if (!parsed.success) return null;
  return Object.entries(parsed.data.properties).map(([name, property]) => ({
    name,
    label: property.title ?? name,
    description: property.description,
    inputType: property.format === 'email' ? 'email' : property.format === 'uri' ? 'url' : 'text',
    required: parsed.data.required.includes(name),
    property,
  }));
}

const emailCheck = z.email();
const urlCheck = z.url({ protocol: /^https?$/ });

/**
 * Client-side checks for quick feedback. The server validates again (and alone knows rules such
 * as the Slack host allowlist), so its 400 issues are shown in the same places.
 */
export function validateConfig(
  fields: ConfigField[],
  values: ConfigValues,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = (values[field.name] ?? '').trim();
    const { property } = field;
    if (value === '') {
      if (field.required) errors[field.name] = `Enter the ${field.label.toLowerCase()}.`;
      continue;
    }
    if (field.inputType === 'email' && !emailCheck.safeParse(value).success) {
      errors[field.name] = 'Enter an email address like name@example.com.';
    } else if (field.inputType === 'url' && !urlCheck.safeParse(value).success) {
      errors[field.name] = 'Enter a full URL starting with https://.';
    } else if (property.minLength !== undefined && value.length < property.minLength) {
      errors[field.name] = `Use at least ${String(property.minLength)} characters.`;
    } else if (property.maxLength !== undefined && value.length > property.maxLength) {
      errors[field.name] = `Use at most ${String(property.maxLength)} characters.`;
    } else if (property.pattern !== undefined && !new RegExp(property.pattern, 'u').test(value)) {
      errors[field.name] = `This doesn't look like a valid ${field.label.toLowerCase()}.`;
    }
  }
  return errors;
}

/** Trimmed values for the fields the schema knows; empty optional fields are left out. */
export function configFromValues(fields: ConfigField[], values: ConfigValues): ConfigValues {
  const config: ConfigValues = {};
  for (const field of fields) {
    const value = (values[field.name] ?? '').trim();
    if (value !== '' || field.required) config[field.name] = value;
  }
  return config;
}
