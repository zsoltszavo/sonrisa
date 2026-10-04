import { Module } from '@nestjs/common';
import { FeedFetcher } from './adapter.js';
import { AdapterRegistry } from './adapter-registry.js';
import { EventIngestedBus } from './event-ingested.js';
import { GdacsAdapter } from './gdacs.adapter.js';
import { IngestionService } from './ingestion.service.js';
import { PollingService } from './polling.service.js';
import { SimulatedAdapter } from './simulated.adapter.js';
import { SimulatedEventsService } from './simulated-events.service.js';
import { UsgsAdapter } from './usgs.adapter.js';

@Module({
  providers: [
    FeedFetcher,
    UsgsAdapter,
    GdacsAdapter,
    SimulatedAdapter,
    AdapterRegistry,
    EventIngestedBus,
    IngestionService,
    PollingService,
    SimulatedEventsService,
  ],
  exports: [EventIngestedBus, PollingService, SimulatedEventsService],
})
export class IngestionModule {}
