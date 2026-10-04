import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { SimulatedEventInput, StoredEvent } from '@sonrisa/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { IngestionService } from './ingestion.service.js';
import { SimulatedAdapter } from './simulated.adapter.js';

/** A disabled Simulated Source takes no Events, like a disabled feed (review CR37). */
function assertEnabled(source: { enabled: boolean }): void {
  if (!source.enabled) throw new ConflictException('The Simulated Source is disabled');
}

/** Admin-made Events (D10 "Simulated Source console"), stored through the normal ingestion path. */
@Injectable()
export class SimulatedEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService,
    private readonly adapter: SimulatedAdapter,
  ) {}

  async create(input: SimulatedEventInput): Promise<StoredEvent> {
    const source = await this.prisma.eventSource.findUnique({
      where: { key: this.adapter.key },
      select: { id: true, enabled: true },
    });
    // The seed creates every Event Source; a missing one is a deployment error, not a client error.
    if (!source) throw new Error('The Simulated Source is missing: run `pnpm db:seed`');
    assertEnabled(source);
    const event = this.adapter.build(input, this.adapter.newExternalId(), new Date());
    return (await this.ingestion.ingestOne(source.id, event)).event;
  }

  /** Only Events of the Simulated Source can be edited; any other id is 404. */
  async update(id: string, input: SimulatedEventInput): Promise<StoredEvent> {
    const existing = await this.prisma.event.findFirst({
      where: { id, source: { key: this.adapter.key } },
      select: {
        sourceId: true,
        externalId: true,
        occurredAt: true,
        source: { select: { enabled: true } },
      },
    });
    if (!existing) throw new NotFoundException('Simulated Event not found');
    assertEnabled(existing.source);
    const event = this.adapter.build(input, existing.externalId, existing.occurredAt);
    return (await this.ingestion.ingestOne(existing.sourceId, event)).event;
  }
}
