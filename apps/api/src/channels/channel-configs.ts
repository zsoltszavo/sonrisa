import { emailSchema } from '@sonrisa/shared';
import { z } from 'zod';
import { validationError } from '../common/validation-error.js';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Config schema per Channel key. S5 turns these into full `ChannelProvider`s (send + test);
 * until then this map is the single place that knows which Channels exist (D11).
 */
const channelConfigSchemas = new Map<string, z.ZodType<Prisma.InputJsonObject>>([
  ['email', z.strictObject({ to: emailSchema })],
  // http allowed: the local Slack Stand-in (D12) has no TLS. Any host is accepted here; the
  // SSRF guard belongs where the request is sent (S5, review CR23).
  ['slack', z.strictObject({ webhookUrl: z.url({ protocol: /^https?$/ }) })],
]);

export function parseChannelConfig(channel: string, config: unknown): Prisma.InputJsonObject {
  const schema = channelConfigSchemas.get(channel);
  if (!schema) {
    throw validationError([{ path: ['channel'], message: `Unknown channel "${channel}"` }]);
  }
  const result = schema.safeParse(config);
  if (!result.success) {
    throw validationError(
      result.error.issues.map(({ path, message }) => ({ path: ['config', ...path], message })),
    );
  }
  return result.data;
}
