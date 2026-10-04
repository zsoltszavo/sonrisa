import { Controller, Get, Query } from '@nestjs/common';
import { type RecentEventsQuery, recentEventsQuerySchema, type StoredEvent } from '@sonrisa/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { FeedService } from './feed.service.js';

@Controller('events')
export class EventsController {
  constructor(private readonly feed: FeedService) {}

  @Get('recent')
  recent(
    @Query(new ZodValidationPipe(recentEventsQuerySchema)) query: RecentEventsQuery,
  ): Promise<StoredEvent[]> {
    return this.feed.recentEvents(query);
  }
}
