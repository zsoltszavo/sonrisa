import { Injectable } from '@nestjs/common';
import {
  MY_NOTIFICATIONS_LIMIT,
  type MyNotification,
  type RecentEventsQuery,
  severitySchema,
  type StoredEvent,
} from '@sonrisa/shared';
import { storedEventFields, toStoredEvent } from '../ingestion/ingestion.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Read-only views for signed-in users: recent Events (rule preview, D14) and their own Notifications. */
@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every user may read Events: they are public world data, not owned by anyone. Old Events are
   * included on purpose; the preview shows what a rule would have matched, never what it notifies.
   */
  async recentEvents(query: RecentEventsQuery): Promise<StoredEvent[]> {
    const rows = await this.prisma.event.findMany({
      where: query.category ? { category: query.category } : {},
      select: storedEventFields,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: query.limit,
    });
    return rows.map(toStoredEvent);
  }

  async myNotifications(userId: string): Promise<MyNotification[]> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      select: {
        id: true,
        kind: true,
        status: true,
        severity: true,
        createdAt: true,
        sentAt: true,
        event: { select: storedEventFields },
        destination: { select: { id: true, label: true, channel: true } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MY_NOTIFICATIONS_LIMIT,
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      // The column is a plain Int; reading it through the schema keeps the 1–5 type honest.
      severity: severitySchema.parse(row.severity),
      createdAt: row.createdAt,
      sentAt: row.sentAt,
      event: toStoredEvent(row.event),
      destination: row.destination,
    }));
  }
}
