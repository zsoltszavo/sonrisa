import { z } from 'zod';
import { channelKeySchema, type Severity } from './event.js';

/** Sends per Notification, counting the first (D11, D21(a)); the admin log shows "attempt n of 3". */
export const MAX_DELIVERY_ATTEMPTS = 3;

/** Words shown next to the number in emails, Slack messages and the UI. */
export const SEVERITY_LABELS: Record<Severity, string> = {
  1: 'Minor',
  2: 'Moderate',
  3: 'Significant',
  4: 'Severe',
  5: 'Critical',
};

/** `GET /channels`: each registered Channel with the JSON Schema of its destination config (D11). */
export const channelInfoSchema = z.object({
  key: channelKeySchema,
  name: z.string(),
  configSchema: z.record(z.string(), z.unknown()),
});
export type ChannelInfo = z.infer<typeof channelInfoSchema>;

/** `POST /destinations/:id/test`: whether the test message was accepted by the Channel. */
export const testDeliveryResultSchema = z.discriminatedUnion('delivered', [
  z.object({ delivered: z.literal(true) }),
  z.object({ delivered: z.literal(false), error: z.string() }),
]);
export type TestDeliveryResult = z.infer<typeof testDeliveryResultSchema>;
