import type { NotificationKind, Severity, StoredEvent } from '@sonrisa/shared';
import type { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';

/** What a Channel is asked to deliver: a Notification about an Event, or a "send test" message. */
export type DeliveryMessage =
  | {
      type: 'notification';
      /** Stable per Notification, so a provider can make repeat sends recognisable (email Message-ID). */
      notificationId: string;
      kind: NotificationKind;
      event: StoredEvent;
      /** The Severity this Notification reports (the Event's Severity when it was decided). */
      severity: Severity;
      /** For an Escalation: the highest Severity this recipient was told about before. */
      previousSeverity: Severity | null;
      ruleCount: number;
      destinationLabel: string;
    }
  | { type: 'test'; destinationLabel: string };

/**
 * A failed send. `retryable` says whether trying again later can help (timeouts, 5xx, 429)
 * or not (rejected address, unknown webhook, blocked host); `retryAfterSeconds` is the
 * receiver's own hint (HTTP 429 `Retry-After`).
 */
export class DeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'DeliveryError';
  }
}

/**
 * One way of delivering Notifications (D11). Adding a Channel means writing one of these and
 * registering it in `ChannelRegistry`; the pipeline and the destination forms pick it up from there.
 */
export interface ChannelProvider<Config extends Prisma.InputJsonObject> {
  /** Stored on `ChannelDestination.channel`; matches `channelKeySchema`. */
  readonly key: string;
  readonly name: string;
  /** Validates a destination's config on save and again before every send. */
  readonly configSchema: z.ZodType<Config>;
  /** Resolves once the receiver accepted the message; throws `DeliveryError` otherwise. */
  send(config: Config, message: DeliveryMessage, signal: AbortSignal): Promise<void>;
}
