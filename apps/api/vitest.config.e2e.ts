import { defineConfig } from 'vitest/config';

// e2e tests boot the real AppModule and need Postgres (`docker compose up -d`).
export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    // Tests drive polls themselves ("poll now", `tick()`) against the saved feed samples.
    env: {
      INGESTION_SCHEDULER: 'off',
      // Its own port, so a Stand-in from docker compose (4010) can keep running beside the tests.
      SLACK_STANDIN_URL: 'http://localhost:4011',
      // The local webhook receiver `webhook.e2e-spec.ts` starts (exempt from the public-only rule).
      WEBHOOK_ALLOWED_ORIGINS: 'http://localhost:4012',
      // Fast retries: 1 s, then 2 s.
      DELIVERY_RETRY_BASE_SECONDS: '1',
    },
    // Delivery tests wait for the worker; a slow first pg-boss start shouldn't fail them.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
