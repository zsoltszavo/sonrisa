import { Injectable } from '@nestjs/common';
import {
  type Event,
  eventSourceKeySchema,
  severitySchema,
  type StoredEvent,
} from '@sonrisa/shared';
import { isPrismaError } from '../common/prisma-errors.js';
import type { Prisma } from '../generated/prisma/client.js';
import { errorMessage } from '../common/error-message.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { contentHash } from './content-hash.js';
import { EventIngestedBus } from './event-ingested.js';

export type IngestOutcome = 'created' | 'updated' | 'unchanged';

export interface IngestSummary {
  created: number;
  updated: number;
  unchanged: number;
  failed: { externalId: string; reason: string }[];
}

export const storedEventFields = {
  id: true,
  externalId: true,
  category: true,
  severity: true,
  title: true,
  summary: true,
  location: true,
  url: true,
  occurredAt: true,
  contentHash: true,
  source: { select: { key: true } },
} as const satisfies Prisma.EventSelect;

type StoredEventRow = Prisma.EventGetPayload<{ select: typeof storedEventFields }>;

export function toStoredEvent(row: StoredEventRow): StoredEvent {
  return {
    id: row.id,
    source: eventSourceKeySchema.parse(row.source.key),
    externalId: row.externalId,
    category: row.category,
    // The column is a plain Int; reading it through the schema keeps the 1–5 type honest.
    severity: severitySchema.parse(row.severity),
    title: row.title,
    summary: row.summary,
    location: row.location,
    url: row.url,
    occurredAt: row.occurredAt,
  };
}

/** Someone else changed the Event between our read and our write; the attempt is retried. */
class ConcurrentChange extends Error {}

const MAX_ATTEMPTS = 3;

/**
 * Stores Events idempotently on (source, externalId) (D6). New content → create; changed content
 * (by `contentHash`) → Event Update; same content → nothing at all. Every stored Severity gets an
 * EventRevision (the first one with `previousSeverity` null), so the history is complete (ADR 0001).
 */
@Injectable()
export class IngestionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bus: EventIngestedBus,
  ) {}

  /**
   * Unchanged items (most of every poll) are recognised from one read of the stored hashes and
   * never open a transaction (review CR35). Each new or changed Event gets its own transaction,
   * so one bad Event never blocks the rest. Stops between Events once `signal` aborts (CR34);
   * the caller sees that from the counts.
   */
  async ingest(sourceId: string, events: Event[], signal: AbortSignal): Promise<IngestSummary> {
    const summary: IngestSummary = { created: 0, updated: 0, unchanged: 0, failed: [] };
    const stored = await this.prisma.event.findMany({
      where: { sourceId, externalId: { in: events.map((event) => event.externalId) } },
      select: { externalId: true, contentHash: true },
    });
    const storedHashes = new Map(stored.map((row) => [row.externalId, row.contentHash]));

    for (const event of events) {
      if (signal.aborted) break;
      // `write` re-checks inside its transaction; this only skips the obvious repeats.
      if (storedHashes.get(event.externalId) === contentHash(event)) {
        summary.unchanged += 1;
        continue;
      }
      try {
        const { outcome } = await this.ingestOne(sourceId, event);
        summary[outcome] += 1;
      } catch (error) {
        // Collected, not swallowed: the poll reports the count and the first reason as lastError.
        summary.failed.push({
          externalId: event.externalId,
          reason: errorMessage(error),
        });
      }
    }
    return summary;
  }

  async ingestOne(
    sourceId: string,
    event: Event,
  ): Promise<{ outcome: IngestOutcome; event: StoredEvent }> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.prisma.$transaction((tx) => this.write(tx, sourceId, event));
      } catch (error) {
        // P2002: a concurrent create of the same (source, externalId) won; retry as an update.
        const retryable = error instanceof ConcurrentChange || isPrismaError(error, 'P2002');
        if (!retryable || attempt >= MAX_ATTEMPTS) throw error;
      }
    }
  }

  private async write(
    tx: Prisma.TransactionClient,
    sourceId: string,
    event: Event,
  ): Promise<{ outcome: IngestOutcome; event: StoredEvent }> {
    const hash = contentHash(event);
    const content = {
      category: event.category,
      severity: event.severity,
      title: event.title,
      summary: event.summary,
      location: event.location,
      url: event.url,
      occurredAt: event.occurredAt,
      contentHash: hash,
    };
    const existing = await tx.event.findUnique({
      where: { sourceId_externalId: { sourceId, externalId: event.externalId } },
      select: storedEventFields,
    });

    if (!existing) {
      const created = await tx.event.create({
        data: {
          sourceId,
          externalId: event.externalId,
          ...content,
          revisions: {
            create: { previousSeverity: null, severity: event.severity, contentHash: hash },
          },
        },
        select: storedEventFields,
      });
      const stored = toStoredEvent(created);
      await this.bus.publish({ event: stored, previous: null }, tx);
      return { outcome: 'created', event: stored };
    }

    const previous = toStoredEvent(existing);
    if (existing.contentHash === hash) return { outcome: 'unchanged', event: previous };

    // Guarded by the hash we read: if another writer got in first, nothing matches and we retry.
    const { count } = await tx.event.updateMany({
      where: { id: existing.id, contentHash: existing.contentHash },
      data: content,
    });
    if (count === 0) throw new ConcurrentChange(`Event ${existing.id} changed concurrently`);
    if (existing.severity !== event.severity) {
      await tx.eventRevision.create({
        data: {
          eventId: existing.id,
          previousSeverity: existing.severity,
          severity: event.severity,
          contentHash: hash,
        },
      });
    }
    const stored: StoredEvent = { ...event, id: existing.id };
    await this.bus.publish({ event: stored, previous }, tx);
    return { outcome: 'updated', event: stored };
  }
}
