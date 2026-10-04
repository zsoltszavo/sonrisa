import { randomUUID } from 'node:crypto';
import {
  alertRuleSchema,
  channelDestinationBaseSchema,
  myNotificationSchema,
  type SimulatedEventInput,
  storedEventSchema,
} from '@sonrisa/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createTestApp,
  registerAdmin,
  registerUser,
  type TestApp,
  type TestUser,
} from './support.js';

/** S6 read endpoints: recent Events for the rule preview (D14) and the user's own Notifications. */
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

async function subscribe(user: TestUser, keyword: string) {
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
  return destination;
}

async function myNotifications(user: TestUser) {
  const response = await api()
    .get('/api/me/notifications')
    .set('Authorization', user.auth)
    .expect(200);
  return z.array(myNotificationSchema).parse(response.body);
}

beforeAll(async () => {
  app = await createTestApp();
  admin = await registerAdmin(app);
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/events/recent', () => {
  it('returns the newest Events first, filtered by Category, to any signed-in user', async () => {
    const user = await registerUser(app, 'reader');
    const token = `feed${randomUUID().slice(0, 8)}`;
    const older = await simulate({
      category: 'market',
      severity: 2,
      title: `${token} older`,
      summary: '',
      location: '',
      url: null,
      occurredAt: new Date(Date.now() - 60_000),
    });
    const newer = await simulate({
      category: 'market',
      severity: 3,
      title: `${token} newer`,
      summary: '',
      location: '',
      url: null,
    });

    const response = await api()
      .get('/api/events/recent?category=market&limit=500')
      .set('Authorization', user.auth)
      .expect(200);
    const events = z.array(storedEventSchema).parse(response.body);

    expect(events.every((event) => event.category === 'market')).toBe(true);
    const ids = events.map((event) => event.id);
    expect(ids.indexOf(newer.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
  });

  it('caps the limit and rejects bad queries', async () => {
    const user = await registerUser(app, 'reader');
    await api().get('/api/events/recent?limit=0').set('Authorization', user.auth).expect(400);
    await api().get('/api/events/recent?limit=501').set('Authorization', user.auth).expect(400);
    await api()
      .get('/api/events/recent?category=weather')
      .set('Authorization', user.auth)
      .expect(400);
    const response = await api()
      .get('/api/events/recent?limit=1')
      .set('Authorization', user.auth)
      .expect(200);
    expect(z.array(storedEventSchema).parse(response.body)).toHaveLength(1);
  });

  it('needs a signed-in user', async () => {
    await api().get('/api/events/recent').expect(401);
  });
});

describe('GET /api/me/notifications', () => {
  it("lists only the caller's Notifications, newest first, with the Escalation marked", async () => {
    const alice = await registerUser(app, 'alice');
    const bob = await registerUser(app, 'bob');
    const keyword = `kw${randomUUID().slice(0, 8)}`;
    const destination = await subscribe(alice, keyword);
    await subscribe(bob, `other${randomUUID().slice(0, 8)}`);

    const input: SimulatedEventInput = {
      category: 'news',
      severity: 3,
      title: `Port strike over ${keyword}`,
      summary: '',
      location: '',
      url: null,
    };
    const event = await simulate(input);
    await api()
      .put(`/api/admin/simulated-events/${event.id}`)
      .set('Authorization', admin.auth)
      .send({ ...input, severity: 5 })
      .expect(200);

    const notifications = await myNotifications(alice);
    expect(notifications.map(({ kind, severity }) => ({ kind, severity }))).toEqual([
      { kind: 'escalation', severity: 5 },
      { kind: 'match', severity: 3 },
    ]);
    expect(notifications[0]?.event).toMatchObject({ id: event.id, severity: 5 });
    expect(notifications[0]?.destination).toEqual({
      id: destination.id,
      label: 'Inbox',
      channel: 'email',
    });

    expect(await myNotifications(bob)).toEqual([]);
  });

  it('keeps a Notification whose destination was deleted, with destination null', async () => {
    const carol = await registerUser(app, 'carol');
    const keyword = `kw${randomUUID().slice(0, 8)}`;
    const destination = await subscribe(carol, keyword);
    await simulate({
      category: 'news',
      severity: 4,
      title: `${keyword} headline`,
      summary: '',
      location: '',
      url: null,
    });

    // A destination in use can't be deleted (D19b), so drop the rule first.
    const response = await api().get('/api/rules').set('Authorization', carol.auth).expect(200);
    const rules = z.array(alertRuleSchema).parse(response.body);
    for (const rule of rules) {
      await api().delete(`/api/rules/${rule.id}`).set('Authorization', carol.auth).expect(204);
    }
    await api()
      .delete(`/api/destinations/${destination.id}`)
      .set('Authorization', carol.auth)
      .expect(204);

    const [notification] = await myNotifications(carol);
    expect(notification?.destination).toBeNull();
  });
});
