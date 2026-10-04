import { defineConfig } from '@playwright/test';
import base from './playwright.config.ts';

/**
 * Records the submission's walkthrough video (walkthrough.mp4 in the repo root, converted from the
 * recorded .webm with ffmpeg): the same stack
 * as the browser test, but slowed down, captioned and filmed. Not part of CI or `test:browser`.
 *
 *   DATABASE_URL=postgresql://sonrisa:sonrisa@localhost:5433/sonrisa_video \
 *     pnpm --filter @sonrisa/e2e exec playwright test -c walkthrough.config.ts
 */
const size = { width: 1440, height: 900 };
/** The docker compose Stand-in, which the seeded `sonrisa · #world-alerts` destination points at. */
export const WALKTHROUGH_STANDIN_URL = 'http://localhost:4010';
const servers = Array.isArray(base.webServer) ? base.webServer : [];

export default defineConfig({
  ...base,
  testDir: './walkthrough',
  outputDir: './test-results/walkthrough',
  timeout: 600_000,
  reporter: 'list',
  use: {
    ...base.use,
    viewport: size,
    video: { mode: 'on', size },
    launchOptions: { slowMo: 120 },
  },
  // Use the docker Stand-in instead of starting one, so alice's seeded Slack destination delivers.
  webServer: servers
    .filter((server) => server.name !== 'Slack Stand-in')
    .map((server) =>
      server.name === 'API'
        ? { ...server, env: { ...server.env, SLACK_STANDIN_URL: WALKTHROUGH_STANDIN_URL } }
        : server,
    ),
  projects: [{ name: 'chromium', use: { browserName: 'chromium', viewport: size } }],
});
