import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.url(),
  API_PORT: z.coerce.number().int().positive().default(3000),
  /** HS256 key: at least 32 characters (256 bits). Generate with `openssl rand -base64 48`. */
  JWT_SECRET: z.string().min(32),
  JWT_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 12),
  /** `off` stops the polling scheduler (e2e tests); "poll now" and the Simulated Source still work. */
  INGESTION_SCHEDULER: z.enum(['on', 'off']).default('on'),
  /** SMTP server for the Email channel: Mailpit locally (docker compose), so nothing leaves the machine. */
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_FROM: z.string().min(1).default('World Event Alerts <alerts@sonrisa.test>'),
  /**
   * Origin of the Slack Stand-in (D12). Slack webhooks may point only at `https://hooks.slack.com`
   * or this origin (SSRF guard, review CR23). Empty (the default) = real Slack only, so a
   * deployment that forgets it can't post to a local port (CR43); `.env.example` sets it for dev.
   */
  SLACK_STANDIN_URL: z.union([z.literal(''), z.url({ protocol: /^https?$/ })]).default(''),
  /**
   * Comma-separated origins (e.g. `http://localhost:4012`) a Webhook destination may use even
   * though they break the URL rules (D24): a local receiver in dev and e2e. Empty (the default) =
   * public https endpoints only.
   */
  WEBHOOK_ALLOWED_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url({ protocol: /^https?$/ }).transform((origin) => new URL(origin).origin))),
  /** First retry delay; each later one doubles it (exponential backoff). A 429 `Retry-After` can lengthen it. */
  DELIVERY_RETRY_BASE_SECONDS: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof envSchema>;

/** Fails startup with a readable message instead of crashing later on a missing variable. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
