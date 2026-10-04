import { Injectable } from '@nestjs/common';
import type { StoredEvent } from '@sonrisa/shared';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Domain event: an Event was stored for the first time (`previous` null) or its content changed
 * (an Event Update, `previous` = the version before it). Repeats of unchanged content emit nothing.
 */
export interface EventIngested {
  event: StoredEvent;
  previous: StoredEvent | null;
}

/**
 * Handlers run inside the transaction that wrote the Event, so whatever they write (S5: the
 * Notifications and their delivery jobs, ADR 0002) commits or rolls back together with it.
 * A failing handler rolls the Event write back; the next poll sees the change again and retries.
 */
export type EventIngestedHandler = (
  ingested: EventIngested,
  tx: Prisma.TransactionClient,
) => Promise<void>;

@Injectable()
export class EventIngestedBus {
  private readonly handlers = new Set<EventIngestedHandler>();

  /** Returns a function that removes the handler again. */
  subscribe(handler: EventIngestedHandler): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  async publish(ingested: EventIngested, tx: Prisma.TransactionClient): Promise<void> {
    for (const handler of this.handlers) {
      await handler(ingested, tx);
    }
  }
}
