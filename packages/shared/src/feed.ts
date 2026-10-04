import { z } from 'zod';
import { categorySchema, severitySchema } from './event.js';
import { storedEventSchema } from './event-source.js';

export const RECENT_EVENTS_DEFAULT_LIMIT = 200;
export const RECENT_EVENTS_MAX_LIMIT = 500;

/** `GET /events/recent`: the newest Events, for the rule editor's live preview (D14). */
export const recentEventsQuerySchema = z.object({
  category: categorySchema.optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(RECENT_EVENTS_MAX_LIMIT)
    .default(RECENT_EVENTS_DEFAULT_LIMIT),
});
export type RecentEventsQuery = z.infer<typeof recentEventsQuerySchema>;

export const notificationKindSchema = z.enum(['match', 'escalation']);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationStatusSchema = z.enum(['pending', 'sent', 'failed']);
export type NotificationStatus = z.infer<typeof notificationStatusSchema>;

export const MY_NOTIFICATIONS_LIMIT = 100;

/** `GET /me/notifications`: one Notification the signed-in user received, newest first. */
export const myNotificationSchema = z.object({
  id: z.string().min(1),
  kind: notificationKindSchema,
  status: notificationStatusSchema,
  /** The Severity this Notification reported; an Escalation's is higher than the earlier one's. */
  severity: severitySchema,
  createdAt: z.coerce.date(),
  sentAt: z.coerce.date().nullable(),
  event: storedEventSchema,
  /** `null` once the Channel Destination has been deleted (D19b). */
  destination: z
    .object({ id: z.string().min(1), label: z.string(), channel: z.string() })
    .nullable(),
});
export type MyNotification = z.infer<typeof myNotificationSchema>;
