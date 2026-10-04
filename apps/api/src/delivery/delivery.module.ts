import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module.js';
import { IngestionModule } from '../ingestion/ingestion.module.js';
import { DeliveryQueue } from './delivery-queue.js';
import { DeliveryService } from './delivery.service.js';
import { NotificationPlanner } from './notification-planner.js';

/** Matching and delivery (S5): EventIngested → Notifications → pg-boss jobs → Channels. */
@Module({
  imports: [IngestionModule, ChannelsModule],
  providers: [DeliveryQueue, NotificationPlanner, DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
