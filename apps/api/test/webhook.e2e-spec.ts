import { randomUUID } from 'node:crypto';
import {
  adminNotificationSchema,
  channelDestinationBaseSchema,
  channelInfoSchema,
  storedEventSchema,
  testDeliveryResultSchema,
  type SimulatedEventInput,
} from '@sonrisa/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createTestApp,
  registerAdmin,
  registerUser,
  type TestApp,
  type TestUser,
  waitFor,
} from './support.js';
import { startWebhookReceiver, type WebhookReceiver } from './webhook-receiver.js';

/**
 * S8 end to end: the Webhook channel (D24) through the real pipeline, to a receiver on the origin
 * `WEBHOOK_ALLOWED_ORIGINS` exempts (vitest.config.e2e.ts). Everything carries RUN.
 */
const RUN = `s8${randomUUID().slice(0, 8)}`;
const RECEIVER_URL = 'http://localhost:4013';

let app: TestApp;
let prisma: PrismaService;
let admin: TestUser;
let receiver: WebhookReceiver;

const api = () => request(app.getHttpServer());

const payloadSchema = z.object({
  type: z.enum(['notification', 'test']),
  id: z.string().optional(),
  kind: z.enum(['match', 'escalation']).optional(),
  severity: z.number().optional(),
  previousSeverity: z.number().nullable().optional(),
  event: z.object({ id: z.string(), title: z.string() }).optional(),
});

/** What the receiver got on one hook path, parsed. */
const receivedOn = (hook: string) =>
  receiver.received
    .filter((r) => r.path === `/hooks/${hook}`)
    .map((r) => ({ headers: r.headers, body: payloadSchema.parse(r.body) }));

interface Subscriber extends TestUser {
  destinationId: string;
  hook: string;
}

async function subscriber(name: string, keyword: string): Promise<Subscriber> {
  const user = await registerUser(app, name);
  const hook = `${RUN}-${name}`;
  const response = await api()
    .post('/api/destinations')
    .set('Authorization', user.auth)
    .send({
      channel: 'webhook',
      label: 'Ops webhook',
      config: { webhookUrl: `${RECEIVER_URL}/hooks/${hook}` },
    })
    .expect(201);
  const destinationId = channelDestinationBaseSchema.parse(response.body).id;
  await api()
    .post('/api/rules')
    .set('Authorization', user.auth)
    .send({
      category: 'earthquake',
      minSeverity: 3,
      keywords: [keyword],
      destinationIds: [destinationId],
    })
    .expect(201);
  return { ...user, destinationId, hook };
}

const quake = (keyword: string, severity: 1 | 2 | 3 | 4 | 5) =>
  ({
    category: 'earthquake',
    severity,
    title: `${RUN} M quake near ${keyword}`,
    summary: 'Shaking felt <widely> & strongly',
    location: `${keyword} region`,
    url: null,
  }) satisfies SimulatedEventInput;

async function simulate(input: SimulatedEventInput) {
  const response = await api()
    .post('/api/admin/simulated-events')
    .set('Authorization', admin.auth)
    .send(input)
    .expect(201);
  return storedEventSchema.parse(response.body);
}

async function notificationsFor(userId: string) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, kind: true, severity: true, status: true, attempts: true, lastError: true },
  });
}

const settled = (rows: { status: string }[]) => rows.every((row) => row.status !== 'pending');

beforeAll(async () => {
  receiver = await startWebhookReceiver(Number(new URL(RECEIVER_URL).port));
  app = await createTestApp();
  prisma = app.get(PrismaService);
  admin = await registerAdmin(app);
});

afterAll(async () => {
  await prisma.event.deleteMany({ where: { title: { startsWith: RUN } } });
  await app.close();
  await receiver.close();
});

beforeEach(() => {
  receiver.received.length = 0;
});

describe('Webhook channel', () => {
  it('is listed by GET /channels with a form-ready config schema', async () => {
    const user = await registerUser(app, 'channels');
    const response = await api().get('/api/channels').set('Authorization', user.auth).expect(200);
    const webhook = z
      .array(channelInfoSchema)
      .parse(response.body)
      .find((c) => c.key === 'webhook');
    expect(webhook).toMatchObject({
      name: 'Webhook',
      configSchema: {
        type: 'object',
        properties: { webhookUrl: { type: 'string', format: 'uri', title: 'Endpoint URL' } },
        required: ['webhookUrl'],
        additionalProperties: false,
      },
    });
  });

  it.each([
    'http://example.com/hook',
    'https://169.254.169.254/latest/meta-data',
    'https://localhost/hook',
    'https://[::1]/hook',
    'http://localhost:4012/hook',
  ])('refuses %s on save', async (webhookUrl) => {
    const user = await registerUser(app, 'ssrf');
    const response = await api()
      .post('/api/destinations')
      .set('Authorization', user.auth)
      .send({ channel: 'webhook', label: 'x', config: { webhookUrl } })
      .expect(400);
    expect(response.body).toMatchObject({ issues: [{ path: ['config', 'webhookUrl'] }] });
  });

  it('delivers a match, then an Escalation, as JSON with the Notification id', async () => {
    const keyword = `${RUN}match`;
    const alice = await subscriber('alice', keyword);
    const event = await simulate(quake(keyword, 3));

    const first = await waitFor(
      'match',
      () => notificationsFor(alice.user.id),
      (r) => r.length === 1 && settled(r),
    );
    expect(first[0]).toMatchObject({ status: 'sent', attempts: 1, kind: 'match' });
    const [match] = receivedOn(alice.hook);
    expect(match?.body).toMatchObject({
      type: 'notification',
      id: first[0]?.id,
      kind: 'match',
      severity: 3,
      event: { id: event.id, title: event.title },
    });
    expect(match?.headers['idempotency-key']).toBe(first[0]?.id);

    await api()
      .put(`/api/admin/simulated-events/${event.id}`)
      .set('Authorization', admin.auth)
      .send({ ...quake(keyword, 4) })
      .expect(200);
    await waitFor(
      'escalation',
      () => notificationsFor(alice.user.id),
      (r) => r.length === 2 && settled(r),
    );
    expect(receivedOn(alice.hook).map((r) => r.body)).toMatchObject([
      { kind: 'match' },
      { kind: 'escalation', severity: 4, previousSeverity: 3 },
    ]);

    // The admin Notification log shows it with no admin change (the Channel is a plain string).
    const log = await api()
      .get('/api/admin/notifications')
      .query({ status: 'sent' })
      .set('Authorization', admin.auth)
      .expect(200);
    const rows = z
      .array(adminNotificationSchema)
      .parse(log.body)
      .filter((n) => n.user.id === alice.user.id);
    expect(rows.map((n) => n.destination?.channel)).toEqual(['webhook', 'webhook']);
  });

  it('retries a 503 and sends once', async () => {
    const keyword = `${RUN}flaky`;
    const bob = await subscriber('bob', keyword);
    receiver.fail(503, 1);
    await simulate(quake(keyword, 3));

    const rows = await waitFor(
      '503 retry',
      () => notificationsFor(bob.user.id),
      (r) => r.length === 1 && settled(r),
    );
    expect(rows[0]).toMatchObject({ status: 'sent', attempts: 2, lastError: null });
    expect(receivedOn(bob.hook)).toHaveLength(1);
  });

  it('fails at once on a 404, without retrying', async () => {
    const keyword = `${RUN}gone`;
    const carol = await subscriber('carol', keyword);
    receiver.fail(404, 1, 'no such hook');
    await simulate(quake(keyword, 3));

    const rows = await waitFor(
      '404 failure',
      () => notificationsFor(carol.user.id),
      (r) => r.length === 1 && settled(r),
    );
    expect(rows[0]).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastError: 'Webhook answered 404 no such hook',
    });
  });

  it('"send test" posts a test payload and reports a refusal', async () => {
    const dave = await subscriber('dave', `${RUN}test`);
    const sendTest = () =>
      api().post(`/api/destinations/${dave.destinationId}/test`).set('Authorization', dave.auth);

    expect(testDeliveryResultSchema.parse((await sendTest().expect(200)).body)).toEqual({
      delivered: true,
    });
    expect(receivedOn(dave.hook).map((r) => r.body)).toEqual([
      expect.objectContaining({ type: 'test' }),
    ]);

    receiver.fail(500, 1, 'boom');
    expect((await sendTest().expect(200)).body).toEqual({
      delivered: false,
      error: 'Webhook answered 500 boom',
    });
  });
});
