import path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminController } from './admin/admin.controller.js';
import { AdminService } from './admin/admin.service.js';
import { AuthModule } from './auth/auth.module.js';
import { ChannelsModule } from './channels/channels.module.js';
import { validateEnv } from './config/env.js';
import { DeliveryModule } from './delivery/delivery.module.js';
import { DestinationsController } from './destinations/destinations.controller.js';
import { DestinationsService } from './destinations/destinations.service.js';
import { HealthController } from './health/health.controller.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { MeController } from './me/me.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RulesController } from './rules/rules.controller.js';
import { RulesService } from './rules/rules.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Repo-root .env, resolved from this file (src/ or dist/) so the cwd doesn't matter; real env vars win.
      envFilePath: [path.resolve(import.meta.dirname, '../../../.env')],
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    IngestionModule,
    ChannelsModule,
    DeliveryModule,
  ],
  controllers: [
    HealthController,
    MeController,
    DestinationsController,
    RulesController,
    AdminController,
  ],
  providers: [DestinationsService, RulesService, AdminService],
})
export class AppModule {}
