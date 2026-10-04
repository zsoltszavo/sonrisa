import { Injectable } from '@nestjs/common';
import type { ChannelInfo } from '@sonrisa/shared';
import { z } from 'zod';
import { validationError } from '../common/validation-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import { type ChannelProvider, DeliveryError, type DeliveryMessage } from './channel-provider.js';
import { EmailChannel } from './email.channel.js';
import { SlackChannel } from './slack.channel.js';
import { WebhookChannel } from './webhook.channel.js';

/**
 * A provider with its config type sealed in: callers hand over the stored (unknown) config and
 * it is parsed by that provider's own schema, so no caller ever casts a config.
 */
interface RegisteredChannel {
  info: ChannelInfo;
  parseConfig(config: unknown): ReturnType<z.ZodType<Prisma.InputJsonObject>['safeParse']>;
  send(config: unknown, message: DeliveryMessage, signal: AbortSignal): Promise<void>;
}

function register<Config extends Prisma.InputJsonObject>(
  provider: ChannelProvider<Config>,
): RegisteredChannel {
  return {
    info: {
      key: provider.key,
      name: provider.name,
      // `io: 'input'`: the shape a form submits. Refinements (e.g. the webhook host check) have no
      // JSON Schema form; the server still applies them on save.
      configSchema: z.toJSONSchema(provider.configSchema, { io: 'input' }),
    },
    parseConfig: (config) => provider.configSchema.safeParse(config),
    send: async (config, message, signal) => {
      // Re-checked at send time: rules such as the webhook host allowlist can change after saving.
      const parsed = provider.configSchema.safeParse(config);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => issue.message).join('; ');
        throw new DeliveryError(`Destination config is not valid: ${issues}`, false);
      }
      await provider.send(parsed.data, message, signal);
    },
  };
}

/** The single place that knows which Channels exist (D11). */
@Injectable()
export class ChannelRegistry {
  private readonly channels: Map<string, RegisteredChannel>;

  constructor(email: EmailChannel, slack: SlackChannel, webhook: WebhookChannel) {
    const registered = [register(email), register(slack), register(webhook)];
    this.channels = new Map(registered.map((channel) => [channel.info.key, channel]));
  }

  list(): ChannelInfo[] {
    return [...this.channels.values()].map((channel) => channel.info);
  }

  /** Throws the API's 400 shape for an unknown Channel or an invalid config. */
  parseConfig(channel: string, config: unknown): Prisma.InputJsonObject {
    const registered = this.channels.get(channel);
    if (!registered) {
      throw validationError([{ path: ['channel'], message: `Unknown channel "${channel}"` }]);
    }
    const result = registered.parseConfig(config);
    if (!result.success) {
      throw validationError(
        result.error.issues.map(({ path, message }) => ({ path: ['config', ...path], message })),
      );
    }
    return result.data;
  }

  /** Throws `DeliveryError` (also for a stored config that no longer validates), or a plain Error for an unknown Channel. */
  async send(
    channel: string,
    config: unknown,
    message: DeliveryMessage,
    signal: AbortSignal,
  ): Promise<void> {
    const registered = this.channels.get(channel);
    if (!registered) throw new Error(`Unknown channel "${channel}"`);
    await registered.send(config, message, signal);
  }
}
