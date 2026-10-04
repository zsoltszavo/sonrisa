import { randomUUID } from 'node:crypto';
import {
  adminEventDetailSchema,
  adminEventSchema,
  adminNotificationSchema,
  channelDestinationBaseSchema,
  type SimulatedEventInput,
  storedEventSchema,
} from '@sonrisa/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createTestApp,
  registerAdmin,
  registerUser,
  type TestApp,
  type TestUser,
} from './support.js';

/** S7 admin read endpoints: the Event explorer, Event detail and the Notification log (D10). */
let app: TestApp;
let admin: TestUser;
const api = () => request(app.getHttpServer());

async function simulate(input: SimulatedEventInput) {
  const response = await api()
    .post('/api/admin/simulated-events')
    .set('Authorization', admin.auth)
    .send(input)
    .expect(201);
  return storedEventSchema.parse(response.body);
}

async function reviseSeverity(id: string, input: SimulatedEventInput) {
  await api()
    .put(`/api/admin/simulated-events/${id}`)
    .set('Authorization', admin.auth)
    .send(input)
    .expect(200);
}

/** A user with one news rule for `keyword`, notifying an email destination. */
async function subscriber(keyword: string) {
  const user = await registerUser(app, 'subscriber');
  const destination = channelDestinationBaseSchema.parse(
    (
      await api()
        .post('/api/destinations')
        .set('Authorization', user.auth)
        .send({ channel: 'email', label: 'Inbox', config: { to: user.user.email } })
        .expect(201)
    ).body,
  );
  await api()
    .post('/api/rules')
    .set('Authorization', user.auth)
    .send({
      category: 'news',
      minSeverity: 2,
      keywords: [keyword],
      destinationIds: [destination.id],
    })
    .expect(201);
  return { user, destination };
}

async function explore(query: Record<string, string>) {
  const response = await api()
    .get('/api/admin/events')
    .query(query)
    .set('Authorization', admin.auth)
    .expect(200);
  return z.array(adminEventSchema).parse(response.body);
}

async function notificationLog(query: Record<string, string>) {
  const response = await api()
    .get('/api/admin/notifications')
    .query(query)
    .set('Authorization', admin.auth)
    .expect(200);
  return z.array(adminNotificationSchema).parse(response.body);
}

const uniqueWord = () => `adm${randomUUID().slice(0, 8)}`;

beforeAll(async () => {
  app = await createTestApp();
  admin = await registerAdmin(app);
});

afterAll(async () => {
  await app.close();
});

describe('admin read endpoints are admin-only', () => {
  const paths = [
    '/api/admin/events',
    `/api/admin/events/${randomUUID()}`,
    '/api/admin/notifications',
  ];

  it.each(paths)('GET %s answers 401 without a token and 403 to a non-admin', async (path) => {
    const user = await registerUser(app, 'nosy');
    await api().get(path).expect(401);
    await api().get(path).set('Authorization', user.auth).expect(403);
  });
});

describe('GET /api/admin/events', () => {
  it('filters by source, Category, minimum Severity and time, newest first', async () => {
    const word = uniqueWord();
    const base = { summary: '', location: 'Lisbon', url: null };
    const old = await simulate({
      ...base,
      category: 'market',
      severity: 2,
      title: `${word} old`,
      occurredAt: new Date('2026-01-01T10:00:00Z'),
    });
    const mid = await simulate({
      ...base,
      category: 'market',
      severity: 4,
      title: `${word} mid`,
      occurredAt: new Date('2026-01-02T10:00:00Z'),
    });
    const news = await simulate({
      ...base,
      category: 'news',
      severity: 5,
      title: `${word} news`,
      occurredAt: new Date('2026-01-03T10:00:00Z'),
    });
    const window = { from: '2026-01-01T00:00:00Z', to: '2026-01-03T23:59:59Z' };
    const ids = (rows: { id: string }[]) => rows.map((row) => row.id);
    const mine = (rows: { id: string }[]) =>
      ids(rows).filter((id) => [old.id, mid.id, news.id].includes(id));

    // Other tests share the database, so look only at this test's Events.
    expect(mine(await explore({ ...window, source: 'simulated' }))).toEqual([
      news.id,
      mid.id,
      old.id,
    ]);
    expect(mine(await explore({ ...window, category: 'market' }))).toEqual([mid.id, old.id]);
    expect(mine(await explore({ ...window, minSeverity: '4' }))).toEqual([news.id, mid.id]);
    expect(
      mine(await explore({ from: '2026-01-02T00:00:00Z', to: '2026-01-02T23:59:59+00:00' })),
    ).toEqual([mid.id]);
    expect(mine(await explore({ ...window, source: 'usgs' }))).toEqual([]);

    const [row] = (await explore({ ...window, category: 'news', minSeverity: '5' })).filter(
      (event) => event.id === news.id,
    );
    expect(row).toMatchObject({ source: 'simulated', title: `${word} news`, notificationCount: 0 });
  });

  it('rejects bad filters with 400', async () => {
    for (const query of [
      { minSeverity: '6' },
      { source: 'twitter' },
      { from: 'yesterday' },
      { from: '2026-02-01T00:00:00Z', to: '2026-01-01T00:00:00Z' },
      { limit: '501' },
    ]) {
      await api()
        .get('/api/admin/events')
        .query(query)
        .set('Authorization', admin.auth)
        .expect(400);
    }
  });
});

describe('GET /api/admin/events/:id', () => {
  it('shows the Severity history and the Notifications the Event caused, Escalation included', async () => {
    const word = uniqueWord();
    const { user, destination } = await subscriber(word);
    const input: SimulatedEventInput = {
      category: 'news',
      severity: 2,
      title: `${word} talks stall`,
      summary: '',
      location: '',
      url: null,
    };
    const event = await simulate(input);
    await reviseSeverity(event.id, { ...input, severity: 4 });

    const response = await api()
      .get(`/api/admin/events/${event.id}`)
      .set('Authorization', admin.auth)
      .expect(200);
    const detail = adminEventDetailSchema.parse(response.body);

    expect(detail).toMatchObject({ id: event.id, severity: 4, notificationCount: 2 });
    expect(detail.revisions.map((r) => [r.previousSeverity, r.severity])).toEqual([
      [null, 2],
      [2, 4],
    ]);
    expect(detail.notifications.map((n) => [n.kind, n.severity])).toEqual([
      ['escalation', 4],
      ['match', 2],
    ]);
    for (const notification of detail.notifications) {
      expect(notification).toMatchObject({
        user: { id: user.user.id, email: user.user.email },
        event: { id: event.id, source: 'simulated', category: 'news' },
        destination: { id: destination.id, label: 'Inbox', channel: 'email' },
      });
    }
  });

  it('answers 404 for an unknown Event', async () => {
    await api()
      .get(`/api/admin/events/${randomUUID()}`)
      .set('Authorization', admin.auth)
      .expect(404);
  });
});

describe('GET /api/admin/notifications', () => {
  it('filters by status, and a retried Notification leaves the failed list', async () => {
    const word = uniqueWord();
    const { user } = await subscriber(word);
    const event = await simulate({
      category: 'news',
      severity: 3,
      title: `${word} outage`,
      summary: '',
      location: '',
      url: null,
    });
    const prisma = app.get(PrismaService);
    const notification = await prisma.notification.findFirstOrThrow({
      where: { eventId: event.id },
    });
    // Delivery may or may not have run yet; force the state this test is about.
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'failed', attempts: 3, lastError: 'SMTP said no' },
    });

    const failed = await notificationLog({ status: 'failed', limit: '500' });
    expect(failed.every((n) => n.status === 'failed')).toBe(true);
    expect(failed.find((n) => n.id === notification.id)).toMatchObject({
      attempts: 3,
      lastError: 'SMTP said no',
      user: { email: user.user.email },
      event: { id: event.id, title: `${word} outage` },
    });

    const all = await notificationLog({});
    expect(all.map((n) => n.id)).toContain(notification.id);

    await api()
      .post(`/api/admin/notifications/${notification.id}/retry`)
      .set('Authorization', admin.auth)
      .expect(202);
    const afterRetry = await notificationLog({ status: 'failed', limit: '500' });
    expect(afterRetry.map((n) => n.id)).not.toContain(notification.id);
  });

  it('rejects an unknown status with 400', async () => {
    await api()
      .get('/api/admin/notifications')
      .query({ status: 'lost' })
      .set('Authorization', admin.auth)
      .expect(400);
  });
});
