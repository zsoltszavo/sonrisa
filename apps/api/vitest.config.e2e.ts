import { defineConfig } from 'vitest/config';

// e2e tests boot the real AppModule and need Postgres (`docker compose up -d`).
export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    // Tests drive polls themselves ("poll now", `tick()`) against the saved feed samples.
    env: { INGESTION_SCHEDULER: 'off' },
  },
});
