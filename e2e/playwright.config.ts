import { defineConfig, devices } from '@playwright/test';
import { PORTS, STANDIN_URL } from './env.ts';

/**
 * Browser end-to-end test of the whole stack: the built API, the Vite dev server and a Slack
 * Stand-in, each on its own port so a dev stack (3000 / 5173 / 4010) can keep running beside it.
 * Postgres and Mailpit come from docker compose. DATABASE_URL must be set explicitly: this run
 * migrates and seeds that database and adds Events and Notifications to it.
 */
const root = '..';

// The API step seeds and adds data, so never let it fall back to the root .env's (dev/demo) database.
if (!process.env.DATABASE_URL) {
  throw new Error(
    'Set DATABASE_URL to a database for this test (not the demo one), e.g. ' +
      'postgresql://sonrisa:sonrisa@localhost:5433/sonrisa_e2e',
  );
}

export default defineConfig({
  testDir: './tests',
  // One flow that shares seeded accounts; running it twice at once would only race itself.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 90_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${String(PORTS.web)}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      name: 'Slack Stand-in',
      command: `node ${root}/apps/slack-standin/src/main.ts`,
      env: { PORT: String(PORTS.standin) },
      url: `${STANDIN_URL}/api/messages`,
      reuseExistingServer: false,
    },
    {
      name: 'API',
      // Migrate and seed (alice and admin), then run the production build.
      command: [
        'pnpm db:migrate',
        'pnpm db:seed',
        'pnpm --filter @sonrisa/shared build',
        'pnpm --filter @sonrisa/api build',
        'node apps/api/dist/main.js',
      ].join(' && '),
      cwd: root,
      env: {
        API_PORT: String(PORTS.api),
        SLACK_STANDIN_URL: STANDIN_URL,
        // Only simulated Events: never call the real feeds from a test.
        INGESTION_SCHEDULER: 'off',
      },
      url: `http://localhost:${String(PORTS.api)}/api/health`,
      timeout: 180_000,
      reuseExistingServer: false,
    },
    {
      name: 'Web',
      command: `pnpm --filter @sonrisa/web exec vite --port ${String(PORTS.web)} --strictPort`,
      cwd: root,
      // The Vite proxy sends /api to this port (vite.config.ts; real env vars win over .env).
      env: { API_PORT: String(PORTS.api) },
      url: `http://localhost:${String(PORTS.web)}`,
      reuseExistingServer: false,
    },
  ],
});
