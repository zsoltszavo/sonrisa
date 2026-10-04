import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAX_DELIVERY_ATTEMPTS } from '@sonrisa/shared';
import { type Db, PgBoss } from 'pg-boss';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';

export const DELIVERY_QUEUE = 'deliver-notification';

const jobDataSchema = z.object({ notificationId: z.string().min(1) });
export type DeliveryJob = z.infer<typeof jobDataSchema>;

export type DeliveryHandler = (notificationId: string, signal: AbortSignal) => Promise<void>;

/**
 * pg-boss statements run on the caller's Prisma transaction, so a job commits or rolls back
 * together with the Notification it delivers (ADR 0002).
 */
function transactionDb(tx: Prisma.TransactionClient): Db {
  return {
    executeSql: async (text, values = []) => ({
      rows: await tx.$queryRawUnsafe<unknown[]>(text, ...values),
    }),
  };
}

/**
 * The delivery job queue (pg-boss, ADR 0002). One job = one delivery attempt of one Notification.
 * Retries of a failed send are new jobs scheduled by `DeliveryService` (so it can honour 429
 * Retry-After); pg-boss's own retry only covers a worker that crashed or threw unexpectedly.
 */
@Injectable()
export class DeliveryQueue implements OnModuleInit, OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DeliveryQueue.name);
  private readonly boss: PgBoss;
  private handler: DeliveryHandler | null = null;

  constructor(config: ConfigService<Env, true>) {
    this.boss = new PgBoss({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      max: 4,
    });
    // pg-boss reports background problems (maintenance, polling) as events, not rejections.
    this.boss.on('error', (error) => {
      this.logger.error(`pg-boss: ${error.message}`, error.stack);
    });
  }

  async onModuleInit(): Promise<void> {
    await this.boss.start();
    await this.boss.createQueue(DELIVERY_QUEUE, {
      // One more run than MAX_DELIVERY_ATTEMPTS: if every claimed attempt is interrupted, the last
      // run still finds no attempt left and marks the Notification failed (CR40, CR94).
      retryLimit: MAX_DELIVERY_ATTEMPTS,
      retryDelay: 5,
      retryBackoff: true,
      expireInSeconds: 120,
    });
  }

  /** Workers start once every module is ready, so a job never meets a half-initialised app. */
  async onApplicationBootstrap(): Promise<void> {
    const handler = this.handler;
    if (!handler) return;
    await this.boss.work<DeliveryJob>(
      DELIVERY_QUEUE,
      { batchSize: 1, pollingIntervalSeconds: 1 },
      async ([job]) => {
        if (!job) return;
        await handler(jobDataSchema.parse(job.data).notificationId, job.signal);
      },
    );
  }

  /** Registers the one handler for delivery jobs (called by `DeliveryService` on init). */
  process(handler: DeliveryHandler): void {
    this.handler = handler;
  }

  /** Queues one delivery attempt per Notification inside the caller's transaction. */
  async enqueue(
    tx: Prisma.TransactionClient,
    notificationIds: readonly string[],
    startAfterSeconds = 0,
  ): Promise<void> {
    if (notificationIds.length === 0) return;
    await this.boss.insert(
      DELIVERY_QUEUE,
      notificationIds.map((notificationId) => ({
        data: { notificationId } satisfies DeliveryJob,
        ...(startAfterSeconds > 0 && { startAfter: startAfterSeconds }),
      })),
      { db: transactionDb(tx) },
    );
  }

  /** Waits for running deliveries, so none is cut off between the send and recording it. */
  async onModuleDestroy(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 30_000 });
  }
}
