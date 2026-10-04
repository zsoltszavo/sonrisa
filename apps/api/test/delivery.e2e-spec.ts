import { type ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  channelDestinationBaseSchema,
  channelInfoSchema,
  storedEventSchema,
  testDeliveryResultSchema,
  type SimulatedEventInput,
} from '@sonrisa/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { DeliveryService } from '../src/delivery/delivery.service.js';
import { NotificationPlanner } from '../src/delivery/notification-planner.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createTestApp,
  registerAdmin,
  registerUser,
  STANDIN_URL,
  type TestApp,
  type TestUser,
} from './support.js';

/**
 * S5 end to end: Simulated Event → Notifications → pg-boss → Email (Mailpit) and Slack (the
 * Stand-in, started here as a real process on STANDIN_URL). Needs `docker compose up -d`
 * (Postgres, Mailpit). Every Event, rule and channel name carries RUN, so parallel files and
 * earlier runs never match.
 */
const RUN = `s5${randomUUID().slice(0, 8)}`;
const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

let app: TestApp;
let prisma: PrismaService;
let admin: TestUser;
let standin: ChildProcess;

async function startStandin(): Promise<ChildProcess> {
  const child = spawn(
    process.execPath,
    [path.resolve(import.meta.dirname, '../../slack-standin/src/main.ts')],
    {
      env: { ...process.env, PORT: new URL(STANDIN_URL).port },
      stdio: ['ignore', 'pipe', 'inherit'],
    },
  );
  // `once` resolves with the event's arguments: the first stdout chunk.
  const args: unknown[] = await once(child.stdout, 'data');
  const chunk = args[0];
  if (!String(chunk).includes('listening')) throw new Error(`Stand-in: ${String(chunk)}`);
  return child;
}

const api = () => request(app.getHttpServer());

async function waitFor<T>(
  what: string,
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = 20_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline)
      throw new Error(`Timed out waiting for ${what}: ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

const standinMessageSchema = z.object({
  channel: z.string(),
  text: z.string().nullable(),
  payload: z.unknown(),
});

async function standinMessages(channel: string) {
  const response = await fetch(`${STANDIN_URL}/api/messages`);
  return z
    .array(standinMessageSchema)
    .parse(await response.json())
    .filter((m) => m.channel === channel);
}

async function injectStandinFailure(status: number, count: number, retryAfter?: number) {
  const response = await fetch(`${STANDIN_URL}/api/failures`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status, count, retryAfter }),
  });
  expect(response.status).toBe(204);
}

const mailpitSearchSchema = z.object({
  messages: z.array(z.object({ ID: z.string(), Subject: z.string() })),
});

async function mailsTo(address: string) {
  const response = await fetch(
    `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}`,
  );
  return mailpitSearchSchema.parse(await response.json()).messages;
}

async function notificationsFor(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'asc' }, { severity: 'asc' }],
    select: {
      id: true,
      kind: true,
      severity: true,
      status: true,
      attempts: true,
      lastError: true,
      destinationId: true,
      eventId: true,
      sentAt: true,
    },
  });
}

const settled = (rows: { status: string }[]) => rows.every((row) => row.status !== 'pending');

interface Subscriber extends TestUser {
  emailId: string;
  slackId: string;
  slackChannel: string;
}

/** A user with an email and a Slack destination and one earthquake rule (≥ minSeverity, keyword). */
async function subscriber(name: string, keyword: string, minSeverity = 3): Promise<Subscriber> {
  const user = await registerUser(app, name);
  const slackChannel = `${RUN}-${name}`;
  const createDestination = async (channel: string, label: string, config: object) => {
    const response = await api()
      .post('/api/destinations')
      .set('Authorization', user.auth)
      .send({ channel, label, config })
      .expect(201);
    return channelDestinationBaseSchema.parse(response.body).id;
  };
  const emailId = await createDestination('email', 'My email', { to: user.user.email });
  const slackId = await createDestination('slack', 'sonrisa · #e2e', {
    webhookUrl: `${STANDIN_URL}/hooks/${slackChannel}`,
  });
  await api()
    .post('/api/rules')
    .set('Authorization', user.auth)
    .send({
      category: 'earthquake',
      minSeverity,
      keywords: [keyword],
      destinationIds: [emailId, slackId],
    })
    .expect(201);
  return { ...user, emailId, slackId, slackChannel };
}

const quake = (
  keyword: string,
  severity: 1 | 2 | 3 | 4 | 5,
  extra: Partial<SimulatedEventInput> = {},
) =>
  ({
    category: 'earthquake',
    severity,
    title: `${RUN} M quake near ${keyword}`,
    summary: 'Shaking felt <widely> & strongly',
    location: `${keyword} region`,
    url: 'https://earthquake.usgs.gov/earthquakes/map/?a=1&b=2',
    ...extra,
  }) satisfies SimulatedEventInput;

async function simulate(input: SimulatedEventInput) {
  const response = await api()
    .post('/api/admin/simulated-events')
    .set('Authorization', admin.auth)
    .send(input)
    .expect(201);
  return storedEventSchema.parse(response.body);
}

async function update(id: string, input: SimulatedEventInput) {
  await api()
    .put(`/api/admin/simulated-events/${id}`)
    .set('Authorization', admin.auth)
    .send(input)
    .expect(200);
}

beforeAll(async () => {
  standin = await startStandin();
  app = await createTestApp();
  prisma = app.get(PrismaService);
  admin = await registerAdmin(app);
});

afterAll(async () => {
  await prisma.event.deleteMany({ where: { title: { startsWith: RUN } } });
  await app.close();
  standin.kill();
});

describe('matching and delivery', () => {
  it('delivers a match to Mailpit and the Stand-in, then one Escalation per upgrade', async () => {
    const keyword = `${RUN}alpha`;
    const alice = await subscriber('alice', keyword);
    const event = await simulate(quake(keyword, 3));

    const matched = await waitFor(
      'match delivery',
      () => notificationsFor(alice.user.id),
      (rows) => rows.length === 2 && settled(rows),
    );
    expect(matched).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          destinationId: alice.emailId,
          kind: 'match',
          severity: 3,
          status: 'sent',
          attempts: 1,
        }),
        expect.objectContaining({
          destinationId: alice.slackId,
          kind: 'match',
          severity: 3,
          status: 'sent',
          attempts: 1,
        }),
      ]),
    );

    const mails = await waitFor(
      'match email',
      () => mailsTo(alice.user.email),
      (m) => m.length === 1,
    );
    expect(mails[0]?.Subject).toBe(`Significant (3/5) earthquake: ${event.title}`);
    const slack = await standinMessages(alice.slackChannel);
    expect(slack).toHaveLength(1);
    expect(slack[0]?.text).toBe(`Significant (3/5) earthquake: ${event.title}`);
    expect(JSON.stringify(slack[0]?.payload)).toContain(
      'Shaking felt &lt;widely&gt; &amp; strongly',
    );

    // Upgrade 3 → 4: one Escalation per destination.
    await update(event.id, quake(keyword, 4));
    const escalated = await waitFor(
      'escalation',
      () => notificationsFor(alice.user.id),
      (rows) => rows.length === 4 && settled(rows),
    );
    expect(
      escalated.filter((n) => n.kind === 'escalation').map((n) => [n.severity, n.status]),
    ).toEqual([
      [4, 'sent'],
      [4, 'sent'],
    ]);
    const escalationMails = await waitFor(
      'escalation email',
      () => mailsTo(alice.user.email),
      (m) => m.length === 2,
    );
    expect(escalationMails.map((m) => m.Subject)).toContain(
      `Escalated to Severe (4/5): ${event.title}`,
    );
    const escalationSlack = await standinMessages(alice.slackChannel);
    expect(escalationSlack.map((m) => m.text)).toContain(
      `Escalated to Severe (4/5): ${event.title}`,
    );
    expect(JSON.stringify(escalationSlack[1]?.payload)).toContain(
      'from Significant (3/5) to Severe (4/5)',
    );

    // Downgrade, text-only edit, and back up to an already-notified Severity: all silent (ADR 0001, D18(d)).
    await update(event.id, quake(keyword, 3));
    await update(event.id, quake(keyword, 3, { summary: 'Revised text' }));
    await update(event.id, quake(keyword, 4));
    expect(await prisma.notification.count({ where: { userId: alice.user.id } })).toBe(4);
  });

  it('does not notify for an Event outside the Freshness Window, or below the rule', async () => {
    const keyword = `${RUN}stale`;
    const bob = await subscriber('bob', keyword, 4);
    const outsideWindow = new Date(Date.now() - 7 * 60 * 60 * 1000); // default window: 6 h
    await simulate(quake(keyword, 5, { occurredAt: outsideWindow }));
    const below = await simulate(quake(keyword, 3));
    expect(await prisma.notification.count({ where: { userId: bob.user.id } })).toBe(0);

    // The same Event raised to the rule's minimum is a new match, not an Escalation.
    await update(below.id, quake(keyword, 4));
    const rows = await waitFor(
      'late match',
      () => notificationsFor(bob.user.id),
      (r) => r.length === 2 && settled(r),
    );
    expect(rows.map((r) => r.kind)).toEqual(['match', 'match']);
  });

  it('writes Notifications and their jobs in the Event transaction (ADR 0002)', async () => {
    const keyword = `${RUN}atomic`;
    const carol = await subscriber('carol', keyword);
    const event = await simulate(quake(keyword, 1)); // below the rule: nothing yet
    const planner = app.get(NotificationPlanner);
    const raised = { ...event, severity: 5 as const };

    let planned: string[] = [];
    await expect(
      prisma.$transaction(async (tx) => {
        planned = await planner.plan({ event: raised, previous: event }, tx);
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');
    // Carol's two destinations (seeded keyword-less rules may add more).
    const carolsDestinations = await prisma.channelDestination.count({
      where: { userId: carol.user.id },
    });
    expect(carolsDestinations).toBe(2);
    expect(planned.length).toBeGreaterThanOrEqual(2);
    expect(await prisma.notification.count({ where: { id: { in: planned } } })).toBe(0);
    const jobs = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pgboss.job WHERE data->>'notificationId' = ANY(${planned})`;
    expect(Number(jobs[0]?.count)).toBe(0);
    expect(await prisma.notification.count({ where: { userId: carol.user.id } })).toBe(0);
  });
});

describe('retries', () => {
  it('retries a 429 after Retry-After and sends once', async () => {
    const keyword = `${RUN}limited`;
    const dave = await subscriber('dave', keyword);
    // 3 s is longer than the first backoff (1 s in e2e), so only Retry-After explains the wait.
    await injectStandinFailure(429, 1, 3);
    await simulate(quake(keyword, 3));

    const rows = await waitFor(
      '429 retry',
      () => notificationsFor(dave.user.id),
      (r) => r.length === 2 && settled(r),
    );
    const slack = rows.find((r) => r.destinationId === dave.slackId);
    expect(slack).toMatchObject({ status: 'sent', attempts: 2, lastError: null });
    // The retry job was scheduled 3 s out. Asserted on the job, not on timing: worker polling
    // jitter (~1 s per fetch) would hide the difference between 1 s and 3 s.
    const delays = await prisma.$queryRaw<{ seconds: number }[]>`
      SELECT extract(epoch FROM start_after - created_on)::float AS seconds FROM pgboss.job
      WHERE data->>'notificationId' = ${slack?.id ?? ''} ORDER BY created_on`;
    expect(delays.map((d) => Math.round(d.seconds))).toEqual([0, 3]);
    expect(await standinMessages(dave.slackChannel)).toHaveLength(1);
  });

  it('marks a Notification failed after 3 attempts; an admin retry delivers it', async () => {
    const keyword = `${RUN}flaky`;
    const erin = await subscriber('erin', keyword);
    await injectStandinFailure(503, 3);
    await simulate(quake(keyword, 3));

    const rows = await waitFor(
      '3 failed attempts',
      () => notificationsFor(erin.user.id),
      (r) => r.length === 2 && settled(r),
    );
    const failed = rows.find((r) => r.destinationId === erin.slackId);
    expect(failed).toMatchObject({ status: 'failed', attempts: 3 });
    expect(failed?.lastError).toContain('503');
    expect(await standinMessages(erin.slackChannel)).toHaveLength(0);
    if (!failed) throw new Error('unreachable');

    // An interrupted 3rd attempt leaves it pending with no attempts left; the job's rerun fails it (CR40).
    await prisma.notification.update({ where: { id: failed.id }, data: { status: 'pending' } });
    await app.get(DeliveryService).attempt(failed.id, new AbortController().signal);
    expect(await prisma.notification.findUniqueOrThrow({ where: { id: failed.id } })).toMatchObject(
      {
        status: 'failed',
        lastError: 'Out of attempts: the last one was interrupted',
      },
    );

    const user = await registerUser(app, 'not-admin');
    await api()
      .post(`/api/admin/notifications/${failed.id}/retry`)
      .set('Authorization', user.auth)
      .expect(403);
    await api()
      .post(`/api/admin/notifications/${failed.id}/retry`)
      .set('Authorization', admin.auth)
      .expect(202);
    await waitFor(
      'admin retry',
      () => prisma.notification.findUniqueOrThrow({ where: { id: failed.id } }),
      (n) => n.status === 'sent',
    );
    expect(await standinMessages(erin.slackChannel)).toHaveLength(1);

    // Only failed Notifications can be retried.
    await api()
      .post(`/api/admin/notifications/${failed.id}/retry`)
      .set('Authorization', admin.auth)
      .expect(409);
    await api()
      .post(`/api/admin/notifications/${randomUUID()}/retry`)
      .set('Authorization', admin.auth)
      .expect(404);
  });

  it('fails at once, without retrying, when Slack rejects the webhook (404 no_service)', async () => {
    const keyword = `${RUN}gone`;
    const frank = await subscriber('frank', keyword);
    await prisma.channelDestination.update({
      where: { id: frank.slackId },
      data: { config: { webhookUrl: `${STANDIN_URL}/hooks/` } },
    });
    await simulate(quake(keyword, 3));
    const rows = await waitFor(
      'permanent failure',
      () => notificationsFor(frank.user.id),
      (r) => r.length === 2 && settled(r),
    );
    expect(rows.find((r) => r.destinationId === frank.slackId)).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastError: 'Slack webhook answered 404 no_service',
    });
  });

  it('refuses at send time a webhook host that is not allowed (SSRF, CR23)', async () => {
    const keyword = `${RUN}ssrf`;
    const grace = await subscriber('grace', keyword);
    // A row saved before the allowlist changed, or written around the API.
    await prisma.channelDestination.update({
      where: { id: grace.slackId },
      data: { config: { webhookUrl: 'http://169.254.169.254/latest/meta-data/' } },
    });
    await simulate(quake(keyword, 3));
    const rows = await waitFor(
      'blocked send',
      () => notificationsFor(grace.user.id),
      (r) => r.length === 2 && settled(r),
    );
    const blocked = rows.find((r) => r.destinationId === grace.slackId);
    expect(blocked).toMatchObject({ status: 'failed', attempts: 1 });
    expect(blocked?.lastError).toContain('Webhook URL must be a Slack Incoming Webhook');
  });
});

describe('channels API', () => {
  it('GET /channels lists each Channel with its config JSON Schema (signed-in only)', async () => {
    await api().get('/api/channels').expect(401);
    const user = await registerUser(app, 'channels');
    const response = await api().get('/api/channels').set('Authorization', user.auth).expect(200);
    const channels = z.array(channelInfoSchema).parse(response.body);
    expect(channels.map((c) => c.key)).toEqual(['email', 'slack']);
    // The web app builds destination forms from these, so the labels must come through (S6).
    expect(channels[0]?.configSchema).toMatchObject({
      properties: { to: { type: 'string', format: 'email', title: 'Email address' } },
      required: ['to'],
    });
    expect(channels[1]?.configSchema).toMatchObject({
      type: 'object',
      properties: { webhookUrl: { type: 'string', format: 'uri', title: 'Webhook URL' } },
      required: ['webhookUrl'],
      additionalProperties: false,
    });
  });

  it('rejects a Slack webhook that is neither Slack nor the Stand-in on save', async () => {
    const user = await registerUser(app, 'ssrf-save');
    const response = await api()
      .post('/api/destinations')
      .set('Authorization', user.auth)
      .send({ channel: 'slack', label: 'x', config: { webhookUrl: 'http://169.254.169.254/' } })
      .expect(400);
    expect(response.body).toMatchObject({ issues: [{ path: ['config', 'webhookUrl'] }] });
  });

  it('"send test" delivers to the destination, reports a refusal, and is owner-only', async () => {
    const keyword = `${RUN}test`;
    const heidi = await subscriber('heidi', keyword);
    const sendTest = (id: string, auth = heidi.auth) =>
      api().post(`/api/destinations/${id}/test`).set('Authorization', auth);

    const email = testDeliveryResultSchema.parse((await sendTest(heidi.emailId).expect(200)).body);
    expect(email).toEqual({ delivered: true });
    const mails = await waitFor(
      'test email',
      () => mailsTo(heidi.user.email),
      (m) => m.length === 1,
    );
    expect(mails[0]?.Subject).toBe('Test message for "My email"');

    expect((await sendTest(heidi.slackId).expect(200)).body).toEqual({ delivered: true });
    expect(await standinMessages(heidi.slackChannel)).toHaveLength(1);

    await injectStandinFailure(500, 1);
    expect((await sendTest(heidi.slackId).expect(200)).body).toEqual({
      delivered: false,
      error: 'Slack webhook answered 500 injected_failure',
    });

    const other = await registerUser(app, 'intruder');
    await sendTest(heidi.slackId, other.auth).expect(404);
  });
});
