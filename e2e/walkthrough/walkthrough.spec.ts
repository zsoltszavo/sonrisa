import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { MAILPIT_URL } from '../env.ts';
import { WALKTHROUGH_STANDIN_URL as STANDIN_URL } from '../walkthrough.config.ts';

/**
 * A filmed tour of sonrisa, first as a user (alice), then as an admin, then back to alice to see
 * the result. It follows the README demo script. Captions and a cursor dot are drawn into the
 * page because Playwright's video shows neither. Checks are light: this is a recording, not a test.
 */
const RUN = randomUUID().slice(0, 4);
const KEYWORD = 'forint';
const EVENT_TITLE = `Forint falls 4% against the euro (${RUN})`;
const SLACK_DESTINATION = 'Team Slack · #demo';

const ALICE = { email: 'alice@demo.test', password: 'sonrisa-alice-demo' };
const ADMIN = { email: 'admin@demo.test', password: 'sonrisa-admin-demo' };

/** Draws a caption bar and a dot that follows the mouse; re-run on every full page load. */
function overlay() {
  const install = () => {
    if (document.getElementById('wt-caption')) return;
    const caption = document.createElement('div');
    caption.id = 'wt-caption';
    caption.style.cssText =
      'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;' +
      'max-width:80%;padding:12px 22px;border-radius:10px;background:rgba(20,32,26,.88);' +
      'color:#fff;font:500 20px/1.35 system-ui,sans-serif;text-align:center;pointer-events:none;' +
      'box-shadow:0 6px 24px rgba(0,0,0,.25)';
    caption.textContent = sessionStorage.getItem('wt-caption') ?? '';
    caption.hidden = !caption.textContent;
    const dot = document.createElement('div');
    dot.id = 'wt-cursor';
    dot.style.cssText =
      'position:fixed;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;' +
      'background:rgba(230,90,40,.55);border:2px solid #fff;z-index:2147483647;' +
      'pointer-events:none;left:-40px;top:-40px;transition:transform .1s';
    document.body.append(caption, dot);
    document.addEventListener('mousemove', (e) => {
      dot.style.left = `${String(e.clientX)}px`;
      dot.style.top = `${String(e.clientY)}px`;
    });
    document.addEventListener('mousedown', () => (dot.style.transform = 'scale(.6)'));
    document.addEventListener('mouseup', () => (dot.style.transform = ''));
  };
  // Init scripts run before <body> exists.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
}

async function say(page: Page, text: string, holdMs = 2600) {
  await page.evaluate((t) => {
    sessionStorage.setItem('wt-caption', t);
    const caption = document.getElementById('wt-caption');
    if (caption) {
      caption.textContent = t;
      caption.hidden = false;
    }
  }, text);
  await page.waitForTimeout(holdMs);
}

async function go(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

async function signIn(page: Page, account: { email: string; password: string }) {
  await go(page, '/login');
  await page.getByLabel('Email').pressSequentially(account.email, { delay: 35 });
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

/** Events from before the tour, so the notifications page and the rule preview aren't empty. */
const BACKGROUND_EVENTS = [
  {
    category: 'market',
    severity: 3,
    title: 'Forint weakens past 410 per euro',
    location: 'Budapest, Hungary',
    hoursAgo: 30,
  },
  {
    category: 'market',
    severity: 4,
    title: 'Brent crude jumps 9% after supply shock',
    location: 'London, UK',
    hoursAgo: 20,
  },
  {
    category: 'earthquake',
    severity: 4,
    title: 'M 6.2 - 41 km SW of Hualien City, Taiwan',
    location: 'Hualien, Taiwan',
    hoursAgo: 5,
  },
  {
    category: 'disaster',
    severity: 5,
    title: 'Red flood alert for the Danube basin',
    location: 'Danube basin',
    hoursAgo: 2,
  },
  {
    category: 'news',
    severity: 3,
    title: 'Central bank announces emergency rate decision',
    location: 'Frankfurt, Germany',
    hoursAgo: 1,
  },
] as const;

test.beforeAll(async ({ request }) => {
  const login = await request.post('/api/auth/login', { data: ADMIN });
  expect(login.ok()).toBe(true);
  const { accessToken } = (await login.json()) as { accessToken: string };
  for (const { hoursAgo, ...event } of BACKGROUND_EVENTS) {
    const created = await request.post('/api/admin/simulated-events', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        ...event,
        summary: '',
        url: null,
        occurredAt: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
      },
    });
    expect(created.ok()).toBe(true);
  }
});

test('walkthrough: user, then admin', async ({ page, context }) => {
  await context.addInitScript(overlay);

  // ── Part 1: the user ──────────────────────────────────────────────
  await go(page, '/login');
  await say(page, 'sonrisa — alerts for things that matter in the world. Part 1: a user (alice).');
  await signIn(page, ALICE);
  await go(page, '/notifications');
  await say(
    page,
    'My notifications: every alert alice received, with its Severity and delivery status.',
    3500,
  );

  await go(page, '/destinations');
  await say(
    page,
    'Destinations: where alerts go. alice already has her email and a Slack channel.',
  );
  await page.getByRole('button', { name: 'Add destination' }).click();
  const dialog = page.getByRole('dialog');
  await say(
    page,
    'Each Channel describes its own settings; this form is generated from that schema.',
  );
  await dialog.getByText('Slack', { exact: true }).click();
  await dialog.getByLabel('Name').pressSequentially(SLACK_DESTINATION, { delay: 30 });
  await dialog.getByLabel('Webhook URL').fill(`${STANDIN_URL}/hooks/demo`);
  await page.waitForTimeout(800);
  await dialog.getByRole('button', { name: 'Add destination' }).click();
  await expect(page.getByText('Destination added')).toBeVisible();
  await page.getByRole('button', { name: `Send a test to ${SLACK_DESTINATION}` }).click();
  await say(page, '“Send test” checks the destination works before any real alert depends on it.');

  await go(page, '/rules');
  await say(page, 'Alert rules: what counts as “important” for alice.');
  await go(page, '/rules/new');
  await say(page, 'A rule is a Category, a minimum Severity and optional Keywords.');
  await page.getByText('Markets', { exact: true }).click();
  const slider = page.getByRole('slider');
  await slider.focus();
  await slider.press('Home');
  await slider.press('ArrowRight');
  await slider.press('ArrowRight');
  await say(
    page,
    'Severity is one 1–5 scale for every source (e.g. 4 ≈ magnitude 6+ or GDACS Orange).',
  );
  await page.getByLabel('Keywords').pressSequentially(KEYWORD, { delay: 60 });
  await page.getByLabel('Keywords').press('Enter');
  await page.getByRole('checkbox', { name: /^My email/ }).check();
  await page.getByRole('checkbox', { name: new RegExp(`^${SLACK_DESTINATION}`) }).check();
  await page
    .getByRole('region', { name: /preview/i })
    .scrollIntoViewIfNeeded()
    .catch(() => undefined);
  await say(
    page,
    'The live preview runs the same matching code as the server against recent Events.',
    3500,
  );
  await page.getByRole('button', { name: 'Create rule' }).click();
  await expect(page.getByText('Rule created')).toBeVisible();
  await say(page, 'Rule saved. Now an admin makes something happen.');
  await signOut(page);

  // ── Part 2: the admin ─────────────────────────────────────────────
  await say(page, 'Part 2: the admin.', 1800);
  await signIn(page, ADMIN);
  await go(page, '/admin/sources');
  await say(page, 'Event Sources: USGS earthquakes, GDACS disasters and a Simulated source.', 3000);
  await say(
    page,
    'Admins enable sources, set the polling interval and Freshness Window, and see poll errors.',
    3000,
  );
  await page
    .getByRole('button', { name: /Poll now/ })
    .first()
    .click();
  await say(page, '“Poll now” fetches the live USGS feed right away.', 3500);

  await go(page, '/admin/simulator');
  await say(page, 'The Simulator injects an Event, e.g. a market move, through the same pipeline.');
  await page.getByLabel('Category').selectOption('market');
  await page.getByLabel('Severity').selectOption('3');
  await page.getByLabel('Title').pressSequentially(EVENT_TITLE, { delay: 25 });
  await page.getByLabel('Location').fill('Budapest, Hungary');
  await page.getByRole('button', { name: 'Create Event' }).click();
  await expect(page.getByText('Event created')).toBeVisible();
  await say(page, 'It matches alice’s rule (Markets, Severity ≥ 3, “forint”).');

  await go(page, '/admin/notifications');
  const entries = page
    .getByRole('list', { name: 'Notifications' })
    .getByRole('listitem')
    .filter({ hasText: EVENT_TITLE });
  await expect(async () => {
    await page.reload();
    await expect(entries.filter({ has: page.getByText('Sent', { exact: true }) })).toHaveCount(2, {
      timeout: 1_000,
    });
  }).toPass({ timeout: 30_000 });
  await say(
    page,
    'Notification log: one delivery per destination, both Sent. Failures can be retried here.',
    3500,
  );

  await go(page, MAILPIT_URL);
  await say(page, 'The email, caught by Mailpit…');
  await page.getByText(EVENT_TITLE).first().click();
  await page.waitForTimeout(2500);
  await go(page, `${STANDIN_URL}/?channel=demo`);
  await say(page, '…and the Slack message (Block Kit) in the Slack Stand-in.');

  await go(page, '/admin/simulator');
  await page
    .getByRole('list', { name: 'Recent simulated Events' })
    .getByText(EVENT_TITLE)
    .first()
    .click();
  await say(
    page,
    'Events change. Raising the Severity sends an Escalation to everyone already notified.',
  );
  await page
    .locator('label')
    .filter({ has: page.getByRole('radio', { name: /^5/ }) })
    .click();
  await page.getByRole('button', { name: 'Update Severity' }).click();
  await expect(page.getByText(/Severity changed to/)).toBeVisible();
  await say(page, 'A downgrade would be stored but never notify (ADR 0001).', 3000);

  await go(page, '/admin/events');
  await say(page, 'Event explorer: every Event from every source, with filters.');
  await page.getByText(EVENT_TITLE).first().click();
  await page.waitForLoadState('networkidle');
  await say(page, 'Event detail: Severity history and every Notification it caused.', 3500);
  await signOut(page);

  // ── Back to the user ──────────────────────────────────────────────
  await signIn(page, ALICE);
  await go(page, '/notifications');
  await expect(
    page
      .getByRole('list', { name: 'Notifications' })
      .getByRole('listitem')
      .filter({ hasText: EVENT_TITLE }),
  ).not.toHaveCount(0);
  await say(page, 'Back as alice: the match and the Escalation are both here.', 4000);
  await say(page, 'That’s sonrisa. Process docs: PROCESS.md in the repo root.', 3000);
});
