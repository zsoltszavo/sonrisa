import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MAX_DELIVERY_ATTEMPTS, type Severity, severitySchema } from '@sonrisa/shared';
import { errorMessage } from '../common/error-message.js';
import { DeliveryError, type DeliveryMessage } from '../channels/channel-provider.js';
import { ChannelRegistry } from '../channels/channel-registry.js';
import type { Env } from '../config/env.js';
import { storedEventFields, toStoredEvent } from '../ingestion/ingestion.service.js';
import { isPrismaError } from '../common/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DeliveryQueue } from './delivery-queue.js';

const MAX_ATTEMPTS = MAX_DELIVERY_ATTEMPTS;
/** Upper bound for one wait, whatever the backoff or a receiver's Retry-After asks for. */
export const MAX_RETRY_DELAY_SECONDS = 3600;

/**
 * Wait before the next attempt: `base · 2^(attempt−1)` (exponential backoff), or longer if the
 * receiver asked for it with Retry-After, capped at `MAX_RETRY_DELAY_SECONDS`.
 */
export function retryDelaySeconds(
  attemptsSoFar: number,
  baseSeconds: number,
  retryAfterSeconds: number | null,
): number {
  const backoff = baseSeconds * 2 ** (attemptsSoFar - 1);
  return Math.min(MAX_RETRY_DELAY_SECONDS, Math.max(backoff, retryAfterSeconds ?? 0));
}

/**
 * Runs delivery jobs. Each job is one attempt; the Notification row is the source of truth:
 * - an attempt is claimed by a conditional update (`pending` and attempts < 3), so a duplicate or
 *   stale job does nothing, and no Notification is ever sent more than 3 times by retries;
 * - `sent` is written only after the Channel accepted the message. If the process dies between
 *   the two, pg-boss runs the job again and the message can arrive twice: delivery is
 *   at-least-once (email keeps the same Message-ID so clients can spot it);
 * - a retryable failure schedules the next attempt in one transaction with recording the error;
 *   a permanent one (or the 3rd attempt) marks the Notification `failed`. Admins can retry it.
 */
@Injectable()
export class DeliveryService implements OnModuleInit {
  private readonly logger = new Logger(DeliveryService.name);
  private readonly retryBaseSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelRegistry,
    private readonly queue: DeliveryQueue,
    config: ConfigService<Env, true>,
  ) {
    this.retryBaseSeconds = config.get('DELIVERY_RETRY_BASE_SECONDS', { infer: true });
  }

  onModuleInit(): void {
    this.queue.process((id, signal) => this.attempt(id, signal));
  }

  async attempt(notificationId: string, signal: AbortSignal): Promise<void> {
    const notification = await this.claim(notificationId);
    if (!notification) return;
    const { destination } = notification;
    if (!destination) {
      await this.finish(notificationId, 'failed', 'Channel Destination was deleted');
      return;
    }

    const severity = severitySchema.parse(notification.severity);
    const message: DeliveryMessage = {
      type: 'notification',
      notificationId,
      kind: notification.kind,
      event: toStoredEvent(notification.event),
      severity,
      previousSeverity:
        notification.kind === 'escalation'
          ? await this.previousSeverity(notification, severity)
          : null,
      ruleCount: notification.ruleIds.length,
      destinationLabel: destination.label,
    };

    try {
      await this.channels.send(destination.channel, destination.config, message, signal);
    } catch (error) {
      // Shutdown or job expiry: the attempt is counted; pg-boss runs the job again later.
      if (signal.aborted) throw error;
      await this.recordFailure(notificationId, notification.attempts, error);
      return;
    }
    await this.finish(notificationId, 'sent', null);
  }

  /**
   * Claims one attempt and reads what the send needs, in one conditional UPDATE (review CR47):
   * only a `pending` Notification with attempts left. Returns null when there is nothing to do
   * (a duplicate or stale job). A Notification out of attempts but still `pending` (its last
   * attempt was interrupted, review CR40) is marked `failed` here, so an admin can retry it.
   */
  private async claim(id: string) {
    try {
      return await this.prisma.notification.update({
        where: { id, status: 'pending', attempts: { lt: MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
        select: {
          id: true,
          userId: true,
          eventId: true,
          destinationId: true,
          kind: true,
          severity: true,
          ruleIds: true,
          attempts: true,
          event: { select: storedEventFields },
          destination: { select: { channel: true, label: true, config: true } },
        },
      });
    } catch (error) {
      if (!isPrismaError(error, 'P2025')) throw error;
      await this.prisma.notification.updateMany({
        where: { id, status: 'pending', attempts: { gte: MAX_ATTEMPTS } },
        data: { status: 'failed', lastError: 'Out of attempts: the last one was interrupted' },
      });
      return null;
    }
  }

  /** Admin retry of a `failed` Notification: a fresh set of 3 attempts. 409 for any other status. */
  async retry(notificationId: string): Promise<{ id: string; status: 'pending' }> {
    await this.prisma.$transaction(async (tx) => {
      const reset = await tx.notification.updateMany({
        where: { id: notificationId, status: 'failed' },
        // `lastError` stays until a send succeeds, so the log still says why it failed.
        data: { status: 'pending', attempts: 0 },
      });
      if (reset.count === 0) {
        const found = await tx.notification.findUnique({
          where: { id: notificationId },
          select: { status: true },
        });
        if (!found) throw new NotFoundException('Notification not found');
        throw new ConflictException(
          `Only failed Notifications can be retried; this one is ${found.status}`,
        );
      }
      await this.queue.enqueue(tx, [notificationId]);
    });
    return { id: notificationId, status: 'pending' };
  }

  private async recordFailure(id: string, attempts: number, error: unknown): Promise<void> {
    const failure =
      error instanceof DeliveryError
        ? error
        : // Not a Channel refusal (unknown channel, a stored config that no longer validates, a
          // provider bug): retrying won't fix it.
          new DeliveryError(errorMessage(error), false);
    if (!(error instanceof DeliveryError)) {
      this.logger.error(
        `Notification ${id}: ${failure.message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
    if (!failure.retryable || attempts >= MAX_ATTEMPTS) {
      await this.finish(id, 'failed', failure.message);
      return;
    }
    const delay = retryDelaySeconds(attempts, this.retryBaseSeconds, failure.retryAfterSeconds);
    await this.prisma.$transaction(async (tx) => {
      await tx.notification.update({ where: { id }, data: { lastError: failure.message } });
      await this.queue.enqueue(tx, [id], delay);
    });
    this.logger.warn(
      `Notification ${id}: attempt ${String(attempts)} failed (${failure.message}); next in ${String(delay)} s`,
    );
  }

  private async finish(id: string, status: 'sent' | 'failed', lastError: string | null) {
    await this.prisma.notification.update({
      where: { id },
      data: status === 'sent' ? { status, sentAt: new Date(), lastError } : { status, lastError },
    });
    if (status === 'failed') this.logger.warn(`Notification ${id} failed: ${String(lastError)}`);
  }

  /** The highest Severity this recipient was notified about before this Escalation. */
  private async previousSeverity(
    n: { userId: string; eventId: string; destinationId: string | null },
    severity: Severity,
  ): Promise<Severity | null> {
    const { _max } = await this.prisma.notification.aggregate({
      where: {
        userId: n.userId,
        eventId: n.eventId,
        destinationId: n.destinationId,
        severity: { lt: severity },
        // What the recipient actually received, not a match that failed or is still on its way (CR44).
        status: 'sent',
      },
      _max: { severity: true },
    });
    return _max.severity === null ? null : severitySchema.parse(_max.severity);
  }
}
