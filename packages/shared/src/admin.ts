import { z } from 'zod';
import { categorySchema, dateSchema, eventSourceKeySchema, severitySchema } from './event.js';
import { storedEventSchema } from './event-source.js';
import { notificationKindSchema, notificationStatusSchema } from './feed.js';

export const ADMIN_LIST_DEFAULT_LIMIT = 100;
export const ADMIN_LIST_MAX_LIMIT = 500;

const limitSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(ADMIN_LIST_MAX_LIMIT)
  .default(ADMIN_LIST_DEFAULT_LIMIT);

/**
 * `GET /admin/events`: the Event explorer's filters (D10). `from`/`to` bound `occurredAt`
 * (inclusive); `minSeverity` keeps Events at or above it, like an Alert Rule does.
 */
export const adminEventsQuerySchema = z
  .object({
    source: eventSourceKeySchema.optional(),
    category: categorySchema.optional(),
    minSeverity: z.coerce.number().pipe(severitySchema).optional(),
    from: z.iso
      .datetime({ offset: true })
      .transform((s) => new Date(s))
      .optional(),
    to: z.iso
      .datetime({ offset: true })
      .transform((s) => new Date(s))
      .optional(),
    limit: limitSchema,
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: '`from` must not be after `to`',
    path: ['from'],
  });
export type AdminEventsQuery = z.infer<typeof adminEventsQuerySchema>;

/** One row of the Event explorer: the Event plus when we stored it and how many Notifications it caused. */
export const adminEventSchema = storedEventSchema.extend({
  createdAt: dateSchema,
  updatedAt: dateSchema,
  notificationCount: z.number().int().min(0),
});
export type AdminEvent = z.infer<typeof adminEventSchema>;

/** One stored Severity of an Event (D20(c)); the first has `previousSeverity: null`. */
export const eventRevisionSchema = z.object({
  id: z.string().min(1),
  previousSeverity: severitySchema.nullable(),
  severity: severitySchema,
  recordedAt: dateSchema,
});
export type EventRevision = z.infer<typeof eventRevisionSchema>;

/** `GET /admin/notifications`: the Notification log's filters. */
export const adminNotificationsQuerySchema = z.object({
  status: notificationStatusSchema.optional(),
  limit: limitSchema,
});
export type AdminNotificationsQuery = z.infer<typeof adminNotificationsQuerySchema>;

/** One Notification as the admin log shows it: who, where, about what, and how delivery went. */
export const adminNotificationSchema = z.object({
  id: z.string().min(1),
  kind: notificationKindSchema,
  status: notificationStatusSchema,
  severity: severitySchema,
  attempts: z.number().int().min(0),
  lastError: z.string().nullable(),
  createdAt: dateSchema,
  sentAt: dateSchema.nullable(),
  user: z.object({ id: z.string().min(1), email: z.string() }),
  event: z.object({
    id: z.string().min(1),
    title: z.string(),
    source: eventSourceKeySchema,
    category: categorySchema,
  }),
  /** `null` once the Channel Destination has been deleted (D19b). */
  destination: z
    .object({ id: z.string().min(1), label: z.string(), channel: z.string() })
    .nullable(),
});
export type AdminNotification = z.infer<typeof adminNotificationSchema>;

/** The Event detail lists at most this many Notifications (newest first); `notificationCount` has the total. */
export const EVENT_DETAIL_NOTIFICATIONS_LIMIT = 200;

/** `GET /admin/events/:id`: the Event, its Severity history (oldest first) and the newest Notifications it caused. */
export const adminEventDetailSchema = adminEventSchema.extend({
  revisions: z.array(eventRevisionSchema),
  notifications: z.array(adminNotificationSchema),
});
export type AdminEventDetail = z.infer<typeof adminEventDetailSchema>;
