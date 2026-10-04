import { alertRuleSchema, channelDestinationBaseSchema } from '@sonrisa/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  createTestApp,
  registerUser,
  STANDIN_URL,
  type TestApp,
  type TestUser,
} from './support.js';

/**
 * IDOR suite (plan S3 "done when"): user B must not be able to read or change anything of
 * user A's, and every refusal must leave A's data exactly as it was.
 */
let app: TestApp;
let prisma: PrismaService;
const api = () => request(app.getHttpServer());

let alice: TestUser;
let bob: TestUser;

async function createDestination(owner: TestUser, label = 'My email') {
  const response = await api()
    .post('/api/destinations')
    .set('Authorization', owner.auth)
    .send({ channel: 'email', label, config: { to: owner.user.email } })
    .expect(201);
  return channelDestinationBaseSchema.parse(response.body);
}

async function createRule(owner: TestUser, destinationIds: string[]) {
  const response = await api()
    .post('/api/rules')
    .set('Authorization', owner.auth)
    .send({ category: 'earthquake', minSeverity: 4, keywords: ['Tokyo'], destinationIds })
    .expect(201);
  return alertRuleSchema.parse(response.body);
}

const ruleUpdate = (destinationIds: string[]) => ({
  category: 'news',
  minSeverity: 1,
  keywords: ['hijacked'],
  destinationIds,
});

beforeAll(async () => {
  app = await createTestApp();
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  alice = await registerUser(app, 'alice');
  bob = await registerUser(app, 'bob');
});

describe('Channel Destinations', () => {
  it('lets the owner create, read, update and delete their own', async () => {
    const created = await createDestination(alice);
    expect(created).toMatchObject({ userId: alice.user.id, channel: 'email' });

    await api().get(`/api/destinations/${created.id}`).set('Authorization', alice.auth).expect(200);
    const updated = await api()
      .put(`/api/destinations/${created.id}`)
      .set('Authorization', alice.auth)
      .send({
        channel: 'slack',
        label: 'Team',
        config: { webhookUrl: `${STANDIN_URL}/hooks/team` },
      })
      .expect(200);
    expect(updated.body).toMatchObject({ channel: 'slack', label: 'Team' });
    await api()
      .delete(`/api/destinations/${created.id}`)
      .set('Authorization', alice.auth)
      .expect(204);
    expect(await prisma.channelDestination.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it("never lists another user's destinations", async () => {
    const own = await createDestination(alice);
    await createDestination(bob);
    const response = await api()
      .get('/api/destinations')
      .set('Authorization', alice.auth)
      .expect(200);
    expect(response.body).toEqual([own]);
  });

  it("answers 404 when B reads, updates or deletes A's destination, and leaves it untouched", async () => {
    const target = await createDestination(alice);
    const before = await prisma.channelDestination.findUniqueOrThrow({ where: { id: target.id } });

    await api().get(`/api/destinations/${target.id}`).set('Authorization', bob.auth).expect(404);
    await api()
      .put(`/api/destinations/${target.id}`)
      .set('Authorization', bob.auth)
      .send({ channel: 'email', label: 'Stolen', config: { to: bob.user.email } })
      .expect(404);
    await api().delete(`/api/destinations/${target.id}`).set('Authorization', bob.auth).expect(404);

    const after = await prisma.channelDestination.findUniqueOrThrow({ where: { id: target.id } });
    expect(after).toEqual(before);
  });

  it.each([
    ['an unknown channel', { channel: 'carrier-pigeon', label: 'x', config: {} }, ['channel']],
    [
      'an invalid email config',
      { channel: 'email', label: 'x', config: { to: 'nope' } },
      ['config', 'to'],
    ],
    [
      'a javascript: webhook',
      { channel: 'slack', label: 'x', config: { webhookUrl: 'javascript:alert(1)' } },
      ['config', 'webhookUrl'],
    ],
    [
      'an extra config field',
      { channel: 'email', label: 'x', config: { to: 'a@b.test', bcc: 'c@d.test' } },
      ['config'],
    ],
    ['a blank label', { channel: 'email', label: '  ', config: { to: 'a@b.test' } }, ['label']],
  ])('rejects %s (400)', async (_label, body, path) => {
    const response = await api()
      .post('/api/destinations')
      .set('Authorization', alice.auth)
      .send(body)
      .expect(400);
    expect(response.body).toMatchObject({ issues: [{ path }] });
  });

  it('refuses to delete a destination a rule still uses (409)', async () => {
    const destination = await createDestination(alice);
    const rule = await createRule(alice, [destination.id]);
    const response = await api()
      .delete(`/api/destinations/${destination.id}`)
      .set('Authorization', alice.auth)
      .expect(409);
    expect(response.body).toMatchObject({ ruleIds: [rule.id] });
  });
});

describe('Alert Rules', () => {
  it('lets the owner create, read, update and delete their own', async () => {
    const email = await createDestination(alice);
    const team = await createDestination(alice, 'Team');
    const rule = await createRule(alice, [email.id]);
    expect(rule).toMatchObject({ userId: alice.user.id, destinationIds: [email.id] });

    const fetched = await api()
      .get(`/api/rules/${rule.id}`)
      .set('Authorization', alice.auth)
      .expect(200);
    expect(fetched.body).toEqual(rule);
    const updated = await api()
      .put(`/api/rules/${rule.id}`)
      .set('Authorization', alice.auth)
      .send(ruleUpdate([team.id]))
      .expect(200);
    expect(alertRuleSchema.parse(updated.body)).toMatchObject({
      category: 'news',
      destinationIds: [team.id],
    });
    await api().delete(`/api/rules/${rule.id}`).set('Authorization', alice.auth).expect(204);
    expect(await prisma.alertRule.findUnique({ where: { id: rule.id } })).toBeNull();
  });

  it("never lists another user's rules", async () => {
    const own = await createRule(alice, [(await createDestination(alice)).id]);
    await createRule(bob, [(await createDestination(bob)).id]);
    const response = await api().get('/api/rules').set('Authorization', alice.auth).expect(200);
    expect(response.body).toEqual([own]);
  });

  it("answers 404 when B reads, updates or deletes A's rule, and leaves it untouched", async () => {
    const target = await createRule(alice, [(await createDestination(alice)).id]);
    const bobsDestination = await createDestination(bob);

    await api().get(`/api/rules/${target.id}`).set('Authorization', bob.auth).expect(404);
    await api()
      .put(`/api/rules/${target.id}`)
      .set('Authorization', bob.auth)
      .send(ruleUpdate([bobsDestination.id]))
      .expect(404);
    await api().delete(`/api/rules/${target.id}`).set('Authorization', bob.auth).expect(404);

    const after = await api()
      .get(`/api/rules/${target.id}`)
      .set('Authorization', alice.auth)
      .expect(200);
    expect(after.body).toEqual(target);
  });

  it("refuses a new rule that notifies A's destination (CR15), and creates nothing", async () => {
    const alicesDestination = await createDestination(alice);
    const response = await api()
      .post('/api/rules')
      .set('Authorization', bob.auth)
      .send(ruleUpdate([alicesDestination.id]))
      .expect(400);
    expect(response.body).toMatchObject({ issues: [{ path: ['destinationIds'] }] });
    expect(await prisma.alertRule.count({ where: { userId: bob.user.id } })).toBe(0);
  });

  it("refuses to add A's destination to B's own rule (CR15), even next to B's own", async () => {
    const bobsDestination = await createDestination(bob);
    const bobsRule = await createRule(bob, [bobsDestination.id]);
    const alicesDestination = await createDestination(alice);

    await api()
      .put(`/api/rules/${bobsRule.id}`)
      .set('Authorization', bob.auth)
      .send(ruleUpdate([bobsDestination.id, alicesDestination.id]))
      .expect(400);
    const after = await api()
      .get(`/api/rules/${bobsRule.id}`)
      .set('Authorization', bob.auth)
      .expect(200);
    expect(after.body).toEqual(bobsRule);
  });

  it('answers a made-up destination id the same way as a foreign one', async () => {
    const alicesDestination = await createDestination(alice);
    const foreign = await api()
      .post('/api/rules')
      .set('Authorization', bob.auth)
      .send(ruleUpdate([alicesDestination.id]))
      .expect(400);
    const madeUp = await api()
      .post('/api/rules')
      .set('Authorization', bob.auth)
      .send(ruleUpdate(['does-not-exist']))
      .expect(400);
    expect(foreign.body).toEqual(madeUp.body);
  });

  it.each([
    ['a Severity outside 1–5', { minSeverity: 9 }, ['minSeverity']],
    ['an unknown Category', { category: 'weather' }, ['category']],
    ['no destinations', { destinationIds: [] }, ['destinationIds']],
    ['duplicate Keywords', { keywords: ['São Paulo', 'sao paulo'] }, ['keywords']],
  ])(
    'validates the body with the shared schema: rejects %s (400)',
    async (_label, override, path) => {
      const destination = await createDestination(alice);
      const response = await api()
        .post('/api/rules')
        .set('Authorization', alice.auth)
        .send({ ...ruleUpdate([destination.id]), ...override })
        .expect(400);
      expect(response.body).toMatchObject({ issues: [{ path }] });
    },
  );

  it('requires a token (401)', async () => {
    await api().get('/api/rules').expect(401);
    await api()
      .post('/api/rules')
      .send(ruleUpdate(['x']))
      .expect(401);
  });
});
