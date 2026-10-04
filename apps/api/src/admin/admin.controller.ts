import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  type AdminEvent,
  type AdminEventDetail,
  type AdminEventsQuery,
  adminEventsQuerySchema,
  type AdminNotification,
  type AdminNotificationsQuery,
  adminNotificationsQuerySchema,
  type EventSource,
  type EventSourceKey,
  eventSourceKeySchema,
  type EventSourceUpdate,
  eventSourceUpdateSchema,
  type PollResult,
  type SimulatedEventInput,
  simulatedEventInputSchema,
  type StoredEvent,
} from '@sonrisa/shared';
import { Roles } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DeliveryService } from '../delivery/delivery.service.js';
import { SimulatedEventsService } from '../ingestion/simulated-events.service.js';
import { AdminService } from './admin.service.js';

const keyPipe = new ZodValidationPipe(eventSourceKeySchema);
const simulatedEventPipe = new ZodValidationPipe(simulatedEventInputSchema);

/**
 * Everything under /admin is admin-only at the class level, so a new handler can't forget it.
 */
@Roles(['admin'])
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly simulated: SimulatedEventsService,
    private readonly delivery: DeliveryService,
  ) {}

  @Get('event-sources')
  eventSources(): Promise<EventSource[]> {
    return this.admin.eventSources();
  }

  @Patch('event-sources/:key')
  updateEventSource(
    @Param('key', keyPipe) key: EventSourceKey,
    @Body(new ZodValidationPipe(eventSourceUpdateSchema)) update: EventSourceUpdate,
  ): Promise<EventSource> {
    return this.admin.updateEventSource(key, update);
  }

  @Post('event-sources/:key/poll')
  @HttpCode(200)
  pollNow(@Param('key', keyPipe) key: EventSourceKey): Promise<PollResult> {
    return this.admin.pollNow(key);
  }

  @Post('simulated-events')
  createSimulatedEvent(@Body(simulatedEventPipe) input: SimulatedEventInput): Promise<StoredEvent> {
    return this.simulated.create(input);
  }

  @Put('simulated-events/:id')
  updateSimulatedEvent(
    @Param('id') id: string,
    @Body(simulatedEventPipe) input: SimulatedEventInput,
  ): Promise<StoredEvent> {
    return this.simulated.update(id, input);
  }

  @Get('events')
  events(
    @Query(new ZodValidationPipe(adminEventsQuerySchema)) query: AdminEventsQuery,
  ): Promise<AdminEvent[]> {
    return this.admin.events(query);
  }

  @Get('events/:id')
  event(@Param('id') id: string): Promise<AdminEventDetail> {
    return this.admin.event(id);
  }

  @Get('notifications')
  notifications(
    @Query(new ZodValidationPipe(adminNotificationsQuerySchema)) query: AdminNotificationsQuery,
  ): Promise<AdminNotification[]> {
    return this.admin.notifications(query);
  }

  /** Queues a `failed` Notification again with a fresh set of attempts; 409 for any other status. */
  @Post('notifications/:id/retry')
  @HttpCode(202)
  retryNotification(@Param('id') id: string): Promise<{ id: string; status: 'pending' }> {
    return this.delivery.retry(id);
  }
}
