import path from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminController } from './admin/admin.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.js';
import { DestinationsController } from './destinations/destinations.controller.js';
import { DestinationsService } from './destinations/destinations.service.js';
import { HealthController } from './health/health.controller.js';
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
  ],
  controllers: [
    HealthController,
    MeController,
    DestinationsController,
    RulesController,
    AdminController,
  ],
  providers: [DestinationsService, RulesService],
})
export class AppModule {}
