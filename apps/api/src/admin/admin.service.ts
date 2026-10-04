import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type AdminEvent,
  type AdminEventDetail,
  type AdminEventsQuery,
  type AdminNotification,
  type AdminNotificationsQuery,
  EVENT_DETAIL_NOTIFICATIONS_LIMIT,
  type EventSource,
  type EventSourceKey,
  type EventSourceUpdate,
  type PollResult,
  severitySchema,
} from '@sonrisa/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { validationError } from '../common/validation-error.js';
import { storedEventFields, toStoredEvent } from '../ingestion/ingestion.service.js';
import { PollingService } from '../ingestion/polling.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const adminEventFields = {
  ...storedEventFields,
  createdAt: true,
  updatedAt: true,
  _count: { select: { notifications: true } },
} as const satisfies Prisma.EventSelect;

const adminNotificationFields = {
  id: true,
  kind: true,
  status: true,
  severity: true,
  attempts: true,
  lastError: true,
  createdAt: true,
  sentAt: true,
  user: { select: { id: true, email: true } },
  event: { select: { id: true, title: true, category: true, source: { select: { key: true } } } },
  destination: { select: { id: true, label: true, channel: true } },
} as const satisfies Prisma.NotificationSelect;

function toAdminEvent(
  row: Prisma.EventGetPayload<{ select: typeof adminEventFields }>,
): AdminEvent {
  return {
    ...toStoredEvent(row),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    notificationCount: row._count.notifications,
  };
}

function toAdminNotification(
  row: Prisma.NotificationGetPayload<{ select: typeof adminNotificationFields }>,
): AdminNotification {
  const { source, ...event } = row.event;
  return {
    ...row,
    // Plain Int columns, read through the schema to keep the 1–5 type honest.
    severity: severitySchema.parse(row.severity),
    event: { ...event, source: source.key },
  };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly polling: PollingService,
  ) {}

  eventSources(): Promise<EventSource[]> {
    return this.prisma.eventSource.findMany({ orderBy: { key: 'asc' } });
  }

  /**
   * Polls the source right away, whether or not it is enabled; 409 while a poll is running.
   * A source that is never polled (Simulated) answers 400 instead of a pointless no-op (CR38).
   */
  async pollNow(key: EventSourceKey): Promise<PollResult> {
    const source = await this.prisma.eventSource.findUnique({ where: { key } });
    if (!source) throw new NotFoundException('Event Source not found');
    if (source.intervalSec === null) {
      throw validationError([{ path: ['key'], message: 'This Event Source is never polled' }]);
    }
    return this.polling.poll(key);
  }

  /** The scheduler re-reads sources on every tick, so a change applies without a restart (D5). */
  async updateEventSource(key: EventSourceKey, update: EventSourceUpdate): Promise<EventSource> {
    const source = await this.prisma.eventSource.findUnique({ where: { key } });
    if (!source) throw new NotFoundException('Event Source not found');
    if (update.intervalSec !== undefined && source.intervalSec === null) {
      throw validationError([
        { path: ['intervalSec'], message: 'This Event Source is never polled' },
      ]);
    }
    return this.prisma.eventSource.update({ where: { key }, data: update });
  }

  /** The Event explorer (D10): newest first, every filter optional. */
  async events(query: AdminEventsQuery): Promise<AdminEvent[]> {
    const rows = await this.prisma.event.findMany({
      where: {
        ...(query.source && { source: { key: query.source } }),
        ...(query.category && { category: query.category }),
        ...(query.minSeverity && { severity: { gte: query.minSeverity } }),
        ...((query.from ?? query.to) && { occurredAt: { gte: query.from, lte: query.to } }),
      },
      select: adminEventFields,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
    });
    return rows.map(toAdminEvent);
  }

  /** One Event with its Severity history (oldest first) and the newest Notifications it caused. */
  async event(id: string): Promise<AdminEventDetail> {
    const row = await this.prisma.event.findUnique({
      where: { id },
      select: {
        ...adminEventFields,
        revisions: {
          select: { id: true, previousSeverity: true, severity: true, recordedAt: true },
          orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
        },
        notifications: {
          select: adminNotificationFields,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          // The Simulator polls this every 2 s; a broad rule must not make it unbounded (CR65).
          take: EVENT_DETAIL_NOTIFICATIONS_LIMIT,
        },
      },
    });
    if (!row) throw new NotFoundException('Event not found');
    return {
      ...toAdminEvent(row),
      revisions: row.revisions.map((revision) => ({
        ...revision,
        previousSeverity:
          revision.previousSeverity === null
            ? null
            : severitySchema.parse(revision.previousSeverity),
        severity: severitySchema.parse(revision.severity),
      })),
      notifications: row.notifications.map(toAdminNotification),
    };
  }

  /** The Notification log (D10): newest first, optionally only one status (e.g. `failed`). */
  async notifications(query: AdminNotificationsQuery): Promise<AdminNotification[]> {
    const rows = await this.prisma.notification.findMany({
      where: query.status ? { status: query.status } : {},
      select: adminNotificationFields,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
    });
    return rows.map(toAdminNotification);
  }
}
