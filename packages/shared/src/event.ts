import { z } from 'zod';
import { normaliseText } from './text.js';

export const categorySchema = z.enum(['earthquake', 'disaster', 'news', 'market']);
export type Category = z.infer<typeof categorySchema>;

/** Common Severity scale: 1 (minor) to 5 (critical). */
/** Every Severity, lowest first. */
export const SEVERITIES = [1, 2, 3, 4, 5] as const;
export const severitySchema = z.literal(SEVERITIES);
export type Severity = z.infer<typeof severitySchema>;

export const eventSourceKeySchema = z.enum(['usgs', 'gdacs', 'simulated']);
export type EventSourceKey = z.infer<typeof eventSourceKeySchema>;

/** A Date, or an ISO 8601 string with an offset (JSON). Not `z.coerce`, which turns `null` into 1970. */
export const dateSchema = z.union([
  z.date(),
  z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
]);

export const eventSchema = z.object({
  source: eventSourceKeySchema,
  externalId: z.string().min(1),
  category: categorySchema,
  severity: severitySchema,
  title: z.string().min(1),
  summary: z.string(),
  /** Human-readable place name, e.g. "37 km N of Sutcliffe, Nevada". Empty when unknown. */
  location: z.string(),
  /** http(s) only: the link is rendered in the UI, emails and Slack, so `javascript:` must not pass. */
  url: z.url({ protocol: /^https?$/ }).nullable(),
  occurredAt: dateSchema,
});
export type Event = z.infer<typeof eventSchema>;

export const MAX_KEYWORD_LENGTH = 100;
export const MAX_KEYWORDS = 20;

export const keywordSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_KEYWORD_LENGTH)
  .refine((keyword) => normaliseText(keyword) !== '', {
    message: 'Keyword must contain at least one letter or digit',
  });

export const keywordsSchema = z
  .array(keywordSchema)
  .max(MAX_KEYWORDS)
  .refine((keywords) => new Set(keywords.map(normaliseText)).size === keywords.length, {
    message: 'Keywords must be unique (ignoring case and accents)',
  });

/** What a user submits when creating or editing an Alert Rule. */
export const alertRuleInputSchema = z.object({
  category: categorySchema,
  minSeverity: severitySchema,
  keywords: keywordsSchema,
  destinationIds: z
    .array(z.string().min(1))
    .min(1)
    .refine((ids) => new Set(ids).size === ids.length, {
      message: 'Destinations must be unique',
    }),
});

export const alertRuleSchema = alertRuleInputSchema.extend({
  id: z.string().min(1),
  userId: z.string().min(1),
});
export type AlertRuleInput = z.infer<typeof alertRuleInputSchema>;
export type AlertRule = z.infer<typeof alertRuleSchema>;

/**
 * A Channel is identified by its provider key (`email`, `slack`, ...). Kept as a string,
 * not an enum, so a new provider can register without editing the shared package (D11).
 */
export const channelKeySchema = z.string().regex(/^[a-z][a-z0-9-]*$/);

/** Fields every Channel Destination has; `config` is validated by the Channel's own provider schema. */
export const channelDestinationBaseSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  channel: channelKeySchema,
  label: z.string().trim().min(1).max(100),
  config: z.unknown(),
});
export type ChannelDestinationBase = z.infer<typeof channelDestinationBaseSchema>;

/** What a user submits when creating or editing a Channel Destination. */
export const channelDestinationInputSchema = channelDestinationBaseSchema.pick({
  channel: true,
  label: true,
  config: true,
});
export type ChannelDestinationInput = z.infer<typeof channelDestinationInputSchema>;
