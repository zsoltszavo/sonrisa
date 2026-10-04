import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { z } from 'zod';
import { MAILPIT_URL, STANDIN_URL } from '../env.ts';

/**
 * The core loop through the real UI: alice adds a Slack destination and an Alert Rule, an admin
 * simulates an Event, and the Notification reaches Mailpit and the Slack Stand-in and shows up
 * on alice's Notifications page. Every name carries RUN, so reruns on the same database (and the
 * seeded rules alice already has) can't satisfy the checks by accident.
 */
const RUN = randomUUID().slice(0, 8);
/** A made-up company name: the Keyword, and a whole word in the Event title (D4). */
const KEYWORD = `zorbex${RUN}`;
const EVENT_TITLE = `${KEYWORD} shares fall 40% after trading halt`;
const SLACK_CHANNEL = `pw-${RUN}`;
const SLACK_DESTINATION = `Playwright ${RUN}`;

const ALICE = { email: 'alice@demo.test', password: 'sonrisa-alice-demo' };
const ADMIN = { email: 'admin@demo.test', password: 'sonrisa-admin-demo' };

/** Set EVIDENCE_DIR to save the README screenshots (docs/evidence/s09) along the way. */
const EVIDENCE_DIR = process.env.EVIDENCE_DIR;
async function evidence(page: Page, name: string) {
  if (EVIDENCE_DIR) await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png`, fullPage: false });
}

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Signing in returns to the page the last session was on, so only check we're in.
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
}

const mailpitSearchSchema = z.object({
  messages: z.array(
    z.object({ Subject: z.string(), To: z.array(z.object({ Address: z.string() })) }),
  ),
});
const standinMessagesSchema = z.array(z.object({ channel: z.string(), payload: z.unknown() }));

async function mailsAbout(keyword: string) {
  const query = `to:"${ALICE.email}" subject:"${keyword}"`;
  const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(query)}`);
  expect(response.ok).toBe(true);
  return mailpitSearchSchema.parse(await response.json()).messages;
}

async function slackMessagesIn(channel: string) {
  const response = await fetch(`${STANDIN_URL}/api/messages`);
  expect(response.ok).toBe(true);
  return standinMessagesSchema.parse(await response.json()).filter((m) => m.channel === channel);
}

const listSchema = z.array(
  z.object({
    id: z.string(),
    label: z.string().optional(),
    keywords: z.array(z.string()).optional(),
  }),
);

/** Removes this run's rule and destination, so reruns don't pile them up on alice. */
async function removeAliceTestData(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', { data: ALICE });
  expect(login.ok()).toBe(true);
  const { accessToken } = z.object({ accessToken: z.string() }).parse(await login.json());
  const headers = { Authorization: `Bearer ${accessToken}` };
  const remove = async (
    path: string,
    mine: (item: z.infer<typeof listSchema>[number]) => boolean,
  ) => {
    const items = listSchema.parse(await (await request.get(`/api/${path}`, { headers })).json());
    for (const item of items.filter(mine)) {
      expect((await request.delete(`/api/${path}/${item.id}`, { headers })).ok()).toBe(true);
    }
  };
  // The rule first: a destination a rule still uses can't be deleted.
  await remove('rules', (rule) => rule.keywords?.includes(KEYWORD) ?? false);
  await remove('destinations', (destination) => destination.label === SLACK_DESTINATION);
}

test.afterEach(async ({ request }) => {
  await removeAliceTestData(request);
});

test('a rule alice creates in the UI notifies her by email and Slack', async ({ page }) => {
  await test.step('alice adds a Slack destination', async () => {
    await signIn(page, ALICE);
    await page.goto('/destinations');
    await page.getByRole('button', { name: 'Add destination' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('Slack', { exact: true }).click();
    await dialog.getByLabel('Name').fill(SLACK_DESTINATION);
    await dialog.getByLabel('Webhook URL').fill(`${STANDIN_URL}/hooks/${SLACK_CHANNEL}`);
    await dialog.getByRole('button', { name: 'Add destination' }).click();
    await expect(page.getByText('Destination added')).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Destinations' }).getByText(SLACK_DESTINATION),
    ).toBeVisible();
  });

  await test.step('alice creates an Alert Rule for Markets with a Keyword', async () => {
    await page.goto('/rules/new');
    await page.getByText('Markets', { exact: true }).click();
    await page.getByLabel('Keywords').fill(KEYWORD);
    await page.getByLabel('Keywords').press('Enter');
    await expect(page.getByRole('list', { name: 'Keywords on this rule' })).toContainText(KEYWORD);
    await page.getByRole('checkbox', { name: /^My email/ }).check();
    await page.getByRole('checkbox', { name: new RegExp(`^${SLACK_DESTINATION}`) }).check();
    await evidence(page, '01-alice-creates-rule');
    await page.getByRole('button', { name: 'Create rule' }).click();
    await expect(page.getByText('Rule created')).toBeVisible();
    await expect(page).toHaveURL(/\/rules$/);
    await signOut(page);
  });

  await test.step('an admin simulates a matching Event', async () => {
    await signIn(page, ADMIN);
    await page.goto('/admin/simulator');
    await page.getByLabel('Category').selectOption('market');
    await page.getByLabel('Severity').selectOption('5');
    await page.getByLabel('Title').fill(EVENT_TITLE);
    await page.getByLabel('Location').fill('Budapest, Hungary');
    await evidence(page, '02-admin-simulates-event');
    await page.getByRole('button', { name: 'Create Event' }).click();
    await expect(page.getByText('Event created')).toBeVisible();
  });

  await test.step('the email reaches Mailpit and the Slack message the Stand-in', async () => {
    await expect
      .poll(async () => (await mailsAbout(KEYWORD)).map((m) => m.Subject), { timeout: 30_000 })
      .toEqual([expect.stringContaining(EVENT_TITLE)]);
    await expect
      .poll(async () => (await slackMessagesIn(SLACK_CHANNEL)).length, { timeout: 30_000 })
      .toBe(1);
    const [message] = await slackMessagesIn(SLACK_CHANNEL);
    expect(JSON.stringify(message?.payload)).toContain(EVENT_TITLE);
  });

  await test.step('the admin Notification log shows both deliveries as sent', async () => {
    await page.goto('/admin/notifications');
    const entries = page.getByRole('listitem').filter({ hasText: EVENT_TITLE });
    await expect(entries).toHaveCount(2);
    await expect(entries.filter({ hasText: 'Sent' })).toHaveCount(2);
    await evidence(page, '03-admin-notification-log');
    await signOut(page);
  });

  await test.step('alice sees both Notifications as delivered', async () => {
    await signIn(page, ALICE);
    await page.goto('/notifications');
    const mine = page
      .getByRole('list', { name: 'Notifications' })
      .getByRole('listitem')
      .filter({ hasText: EVENT_TITLE });
    await expect(mine).toHaveCount(2);
    await expect(mine.filter({ hasText: 'Delivered' })).toHaveCount(2);
    await evidence(page, '04-alice-notifications');
  });

  if (EVIDENCE_DIR) {
    await test.step('evidence: the Mailpit inbox and the Stand-in channel', async () => {
      await page.goto(MAILPIT_URL);
      await expect(page.getByText(EVENT_TITLE).first()).toBeVisible();
      await evidence(page, '05-mailpit-inbox');
      await page.goto(`${STANDIN_URL}/?channel=${SLACK_CHANNEL}`);
      await expect(page.getByText(EVENT_TITLE).first()).toBeVisible();
      await evidence(page, '06-slack-standin');
    });
  }
});
