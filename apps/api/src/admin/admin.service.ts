import { Injectable, NotFoundException } from '@nestjs/common';
import type { EventSource, EventSourceKey, EventSourceUpdate, PollResult } from '@sonrisa/shared';
import { validationError } from '../common/validation-error.js';
import { PollingService } from '../ingestion/polling.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

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
}
