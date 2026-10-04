import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { type Event, eventSchema, type SimulatedEventInput } from '@sonrisa/shared';
import { type AdapterBatch, emptyBatch, type EventSourceAdapter } from './adapter.js';

/**
 * The Simulated Source (D2): its Events are pushed by an Admin through the API, never polled.
 * It still goes through `eventSchema` and the same ingestion path, so a simulated Event Update
 * behaves exactly like a real one (revisions, EventIngested, later Escalations).
 */
@Injectable()
export class SimulatedAdapter implements EventSourceAdapter {
  readonly key = 'simulated';

  poll(): Promise<AdapterBatch> {
    return Promise.resolve(emptyBatch());
  }

  newExternalId(): string {
    return `sim-${randomUUID()}`;
  }

  build(input: SimulatedEventInput, externalId: string, occurredAt: Date): Event {
    return eventSchema.parse({
      ...input,
      source: this.key,
      externalId,
      occurredAt: input.occurredAt ?? occurredAt,
    });
  }
}
