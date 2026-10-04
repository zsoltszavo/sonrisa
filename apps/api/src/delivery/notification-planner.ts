import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  decideNotifications,
  isFresh,
  type NotifiedRecipient,
  severitySchema,
} from '@sonrisa/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { type EventIngested, EventIngestedBus } from '../ingestion/event-ingested.js';
import { DeliveryQueue } from './delivery-queue.js';

/**
 * Turns every ingested Event / Event Update into Notifications (S5): Freshness Window, then
 * `decideNotifications` (ADR 0001), then the Notification rows and their delivery jobs, all in
 * the transaction that wrote the Event (D20(a), ADR 0002). Nothing here talks to a Channel.
 */
@Injectable()
export class NotificationPlanner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationPlanner.name);
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly bus: EventIngestedBus,
    private readonly queue: DeliveryQueue,
  ) {}

  onModuleInit(): void {
    this.unsubscribe = this.bus.subscribe(async (ingested, tx) => {
      await this.plan(ingested, tx);
    });
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
  }

  /** Returns the ids of the Notifications it created (for logs and tests). */
  async plan({ event, previous }: EventIngested, tx: Prisma.TransactionClient): Promise<string[]> {
    const source = await tx.eventSource.findUniqueOrThrow({
      where: { key: event.source },
      select: { freshnessHours: true },
    });
    // The Freshness Window keeps old Events quiet (D15). A raised Severity is news now, however
    // old the Event: GDACS keeps `occurredAt` while a Green alert turns Red days later (D25).
    const raised = previous !== null && event.severity > previous.severity;
    if (!raised && !isFresh(event, source.freshnessHours, new Date())) return [];

    // Category and Severity narrow the rules in SQL; Keywords are matched by the shared code.
    const rules = await tx.alertRule.findMany({
      where: { category: event.category, minSeverity: { lte: event.severity } },
      select: {
        id: true,
        userId: true,
        category: true,
        minSeverity: true,
        keywords: true,
        destinations: { select: { destinationId: true } },
      },
    });
    if (rules.length === 0) return [];

    const notified = await tx.notification.groupBy({
      by: ['userId', 'destinationId'],
      where: { eventId: event.id },
      _max: { severity: true },
    });
    const alreadyNotified: NotifiedRecipient[] = notified.flatMap(
      ({ userId, destinationId, _max }) =>
        // Rows of a deleted destination (NULL) can't be notified again anyway (D19(b)).
        destinationId === null || _max.severity === null
          ? []
          : [{ userId, destinationId, highestSeverity: severitySchema.parse(_max.severity) }],
    );

    const decisions = decideNotifications({
      event,
      rules: rules.map((rule) => ({
        ...rule,
        minSeverity: severitySchema.parse(rule.minSeverity),
        destinationIds: rule.destinations.map((d) => d.destinationId),
      })),
      alreadyNotified,
    });
    if (decisions.length === 0) return [];

    // skipDuplicates: the (user, event, destination, Severity) key makes a replay a no-op (D19(a)).
    const created = await tx.notification.createManyAndReturn({
      data: decisions.map((decision) => ({
        userId: decision.userId,
        eventId: event.id,
        destinationId: decision.destinationId,
        kind: decision.kind,
        severity: event.severity,
        ruleIds: decision.ruleIds,
      })),
      skipDuplicates: true,
      select: { id: true },
    });
    const ids = created.map((row) => row.id);
    await this.queue.enqueue(tx, ids);
    this.logger.log(`Event ${event.id}: ${String(ids.length)} Notification(s) queued`);
    return ids;
  }
}
