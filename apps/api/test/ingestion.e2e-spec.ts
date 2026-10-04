import { randomUUID } from 'node:crypto';
import {
  eventSourceSchema,
  pollResultSchema,
  type SimulatedEventInput,
  storedEventSchema,
} from '@sonrisa/shared';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FeedFetcher } from '../src/ingestion/adapter.js';
import { type EventIngested, EventIngestedBus } from '../src/ingestion/event-ingested.js';
import { readFeedSample } from '../src/ingestion/feed-samples.test-util.js';
import { GDACS_FEED_URL } from '../src/ingestion/gdacs.adapter.js';
import { PollingService } from '../src/ingestion/polling.service.js';
import { USGS_FEED_URL } from '../src/ingestion/usgs.adapter.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { EVENT_SOURCES, seedEventSources } from '../src/seed/seed.js';
import {
  createTestApp,
  registerAdmin,
  registerUser,
  type TestApp,
  type TestUser,
} from './support.js';

/**
 * Ingestion against real Postgres (plan S4 "done when"): the real adapters, IngestionService and
 * PollingService run; only the HTTP fetch is replaced by the saved feed samples. Every test
 * prefixes the sample's ids with its own run id, so runs never see each other's Events.
 */
class FixtureFetcher {
  readonly bodies = new Map<string, string>();
  /** Polls wait on this before "receiving" the body; lets a test hold a poll in flight. */
  gate: Promise<void> = Promise.resolve();

  async fetchText(url: string, signal: AbortSignal): Promise<string> {
    // Like a real fetch, a held request gives up when the poll is aborted.
    await Promise.race([
      this.gate,
      new Promise<never>((_resolve, reject) => {
        const abort = () => {
          reject(new Error('Fetch aborted', { cause: signal.reason }));
        };
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort);
      }),
    ]);
    const body = this.bodies.get(url);
    if (body === undefined) throw new Error(`No fixture for ${url}`);
    return body;
  }
}

const usgsSample = z
  .looseObject({
    features: z.array(
      z.looseObject({ id: z.string(), properties: z.looseObject({ title: z.string() }) }),
    ),
  })
  .parse(JSON.parse(readFeedSample('usgs')));
const gdacsSample = readFeedSample('gdacs');

/** The USGS sample with ids prefixed, and optionally one feature's properties changed. */
function usgsFixture(prefix: string, revise?: { id: string; change: Record<string, unknown> }) {
  return JSON.stringify({
    ...usgsSample,
    features: usgsSample.features.map((feature) => ({
      ...feature,
      id: `${prefix}${feature.id}`,
      properties:
        feature.id === revise?.id
          ? { ...feature.properties, ...revise.change }
          : feature.properties,
    })),
  });
}

const gdacsFixture = (prefix: string) =>
  gdacsSample.replaceAll('<guid isPermaLink="false">', `<guid isPermaLink="false">${prefix}`);

const RUN = `e2e-${randomUUID().slice(0, 8)}-`;

let app: TestApp;
let prisma: PrismaService;
let polling: PollingService;
const fetcher = new FixtureFetcher();
const api = () => request(app.getHttpServer());

let admin: TestUser;
let prefix: string;
let ingested: EventIngested[];
let unsubscribe = () => {};

const eventsOf = (source: 'usgs' | 'gdacs') =>
  prisma.event.findMany({
    where: { externalId: { startsWith: prefix }, source: { key: source } },
    include: { revisions: { orderBy: { recordedAt: 'asc' } } },
    orderBy: { externalId: 'asc' },
  });

async function pollNow(source: string, as: TestUser = admin) {
  const response = await api()
    .post(`/api/admin/event-sources/${source}/poll`)
    .set('Authorization', as.auth)
    .expect(200);
  return pollResultSchema.parse(response.body);
}

const sourceRow = (key: 'usgs' | 'gdacs' | 'simulated') =>
  prisma.eventSource.findUniqueOrThrow({ where: { key } });

beforeAll(async () => {
  app = await createTestApp((builder) => builder.overrideProvider(FeedFetcher).useValue(fetcher));
  prisma = app.get(PrismaService);
  polling = app.get(PollingService);
  await seedEventSources(prisma);
  admin = await registerAdmin(app);
});

afterAll(async () => {
  await polling.whenIdle();
  await prisma.event.deleteMany({ where: { externalId: { startsWith: RUN } } });
  // Simulated Events get generated ids; every one these tests create has an "e2e " title.
  await prisma.event.deleteMany({
    where: { source: { key: 'simulated' }, title: { startsWith: 'e2e ' } },
  });
  await app.close();
});

beforeEach(async () => {
  prefix = `${RUN}${randomUUID().slice(0, 8)}-`;
  fetcher.bodies.set(USGS_FEED_URL, usgsFixture(prefix));
  fetcher.bodies.set(GDACS_FEED_URL, gdacsFixture(prefix));
  fetcher.gate = Promise.resolve();
  // Back to the seeded settings, so tests that change a source don't leak into the next one.
  for (const { key, intervalSec } of EVENT_SOURCES) {
    await prisma.eventSource.update({
      where: { key },
      data: { enabled: true, intervalSec, freshnessHours: 6, lastPollAt: null, lastError: null },
    });
  }
  ingested = [];
  unsubscribe();
  unsubscribe = app.get(EventIngestedBus).subscribe((event) => {
    if (event.event.externalId.startsWith(prefix) || event.event.source === 'simulated') {
      ingested.push(event);
    }
    return Promise.resolve();
  });
});

describe('USGS polling (saved sample)', () => {
  it('stores the sample once; a repeated poll creates 0 new Events', async () => {
    expect(await pollNow('usgs')).toEqual({
      source: 'usgs',
      fetched: 5,
      created: 5,
      updated: 0,
      unchanged: 0,
      ignored: 0,
      skipped: 0,
      failed: 0,
      error: null,
    });
    const first = await eventsOf('usgs');
    expect(first).toHaveLength(5);
    // Every stored Severity is in the history, starting with the first one.
    for (const event of first) {
      expect(event.revisions.map((r) => [r.previousSeverity, r.severity])).toEqual([
        [null, event.severity],
      ]);
    }
    expect(ingested).toHaveLength(5);
    expect(ingested.every((e) => e.previous === null)).toBe(true);

    expect(await pollNow('usgs')).toMatchObject({ created: 0, updated: 0, unchanged: 5 });
    const second = await eventsOf('usgs');
    expect(second).toEqual(first);
    expect(ingested).toHaveLength(5); // unchanged content emits nothing

    const source = await sourceRow('usgs');
    expect(source.lastPollAt).not.toBeNull();
    expect(source.lastError).toBeNull();
  });

  it('a revised fixture (M5.0 → M6.1) updates the Event, records a revision and emits the previous version', async () => {
    await pollNow('usgs');
    fetcher.bodies.set(
      USGS_FEED_URL,
      usgsFixture(prefix, {
        id: 'us6000tzj8',
        change: { mag: 6.1, title: 'M 6.1 - 295 km S of Burica, Panama' },
      }),
    );

    expect(await pollNow('usgs')).toMatchObject({ created: 0, updated: 1, unchanged: 4 });

    const events = await eventsOf('usgs');
    expect(events).toHaveLength(5);
    const revised = events.find((event) => event.externalId === `${prefix}us6000tzj8`);
    expect(revised).toMatchObject({ severity: 4, title: 'M 6.1 - 295 km S of Burica, Panama' });
    expect(revised?.revisions.map((r) => [r.previousSeverity, r.severity])).toEqual([
      [null, 3],
      [3, 4],
    ]);
    expect(revised?.revisions[1]?.contentHash).toBe(revised?.contentHash);

    const update = ingested.at(-1);
    expect(update?.event).toMatchObject({ id: revised?.id, severity: 4 });
    expect(update?.previous).toMatchObject({
      id: revised?.id,
      severity: 3,
    });
    expect(update?.previous?.title).toBe('M 5.0 - 295 km S of Burica, Panama');
  });

  it('a text-only revision is an Event Update without a new revision', async () => {
    await pollNow('usgs');
    fetcher.bodies.set(
      USGS_FEED_URL,
      usgsFixture(prefix, { id: 'us6000tzj8', change: { place: '296 km S of Burica, Panama' } }),
    );

    expect(await pollNow('usgs')).toMatchObject({ updated: 1, unchanged: 4 });
    const revised = (await eventsOf('usgs')).find((e) => e.externalId === `${prefix}us6000tzj8`);
    expect(revised?.location).toBe('296 km S of Burica, Panama');
    expect(revised?.revisions).toHaveLength(1);
    expect(ingested.at(-1)?.previous?.location).toBe('295 km S of Burica, Panama');
  });

  it('a failed poll records lastError and lastPollAt; the next good poll clears lastError', async () => {
    fetcher.bodies.set(USGS_FEED_URL, '<html>503 Service Unavailable</html>');
    const failed = await pollNow('usgs');
    expect(failed.error).toMatch(/\S/);
    expect(failed.created).toBe(0);
    const afterFailure = await sourceRow('usgs');
    expect(afterFailure.lastError).toBe(failed.error);
    expect(afterFailure.lastPollAt).not.toBeNull();

    fetcher.bodies.set(USGS_FEED_URL, usgsFixture(prefix));
    expect(await pollNow('usgs')).toMatchObject({ created: 5, error: null });
    expect((await sourceRow('usgs')).lastError).toBeNull();
  });

  it('records skipped items in lastError without losing the valid ones', async () => {
    fetcher.bodies.set(
      USGS_FEED_URL,
      usgsFixture(prefix, { id: 'us6000tzj8', change: { url: 'javascript:alert(1)' } }),
    );
    expect(await pollNow('usgs')).toMatchObject({ created: 4, skipped: 1 });
    expect((await sourceRow('usgs')).lastError).toMatch(
      /^1 item\(s\) not stored; first: skipped .*us6000tzj8/,
    );
  });
});

describe('GDACS polling (saved sample)', () => {
  it('stores 174 Events without the earthquakes; a repeated poll creates 0 new Events', async () => {
    expect(await pollNow('gdacs')).toMatchObject({
      fetched: 179,
      created: 174,
      ignored: 5,
      skipped: 0,
      failed: 0,
      error: null,
    });
    const events = await eventsOf('gdacs');
    expect(events).toHaveLength(174);
    expect(events.filter((e) => e.externalId.startsWith(`${prefix}EQ`))).toEqual([]);
    expect(events.find((e) => e.externalId === `${prefix}TC1001325`)).toMatchObject({
      category: 'disaster',
      severity: 5,
    });

    expect(await pollNow('gdacs')).toMatchObject({ created: 0, updated: 0, unchanged: 174 });
    expect(await eventsOf('gdacs')).toHaveLength(174);
  });

  it('stores an id listed twice in one response once, without flip-flopping between polls (CR33)', async () => {
    const first = /<item>[\s\S]*?<\/item>/.exec(gdacsFixture(prefix))?.[0] ?? '';
    const twin = first.replace(/<description>[^<]*</, '<description>Another episode<');
    fetcher.bodies.set(
      GDACS_FEED_URL,
      gdacsFixture(prefix).replace('</channel>', `${twin}</channel>`),
    );

    expect(await pollNow('gdacs')).toMatchObject({ fetched: 180, created: 174, skipped: 1 });
    expect((await sourceRow('gdacs')).lastError).toMatch(/more than once/);
    const flood = (await eventsOf('gdacs')).find((e) => e.externalId === `${prefix}FL1104169`);
    expect(flood?.summary).toBe('Another episode'); // the last one wins

    expect(await pollNow('gdacs')).toMatchObject({ created: 0, updated: 0, unchanged: 174 });
  });

  it('a raised alert level (Green → Orange) records a revision', async () => {
    await pollNow('gdacs');
    fetcher.bodies.set(
      GDACS_FEED_URL,
      gdacsFixture(prefix).replace(
        '<gdacs:alertlevel>Green</gdacs:alertlevel>',
        '<gdacs:alertlevel>Orange</gdacs:alertlevel>',
      ),
    );
    expect(await pollNow('gdacs')).toMatchObject({ updated: 1, unchanged: 173 });
    const flood = (await eventsOf('gdacs')).find((e) => e.externalId === `${prefix}FL1104169`);
    expect(flood?.revisions.map((r) => [r.previousSeverity, r.severity])).toEqual([
      [null, 2],
      [2, 4],
    ]);
  });
});

describe('scheduler', () => {
  it('never runs two polls of one source at once: "poll now" answers 409 and the tick skips it', async () => {
    let release = () => {};
    fetcher.gate = new Promise((resolve) => {
      release = resolve;
    });
    const first = polling.poll('usgs');

    await api()
      .post('/api/admin/event-sources/usgs/poll')
      .set('Authorization', admin.auth)
      .expect(409);
    // gdacs is due (never polled) and is started; usgs is due too but already in flight.
    expect(await polling.tick()).toEqual(['gdacs']);

    release();
    expect(await first).toMatchObject({ created: 5 });
    await polling.whenIdle();
    expect(await eventsOf('usgs')).toHaveLength(5);
  });

  it('reads intervals and enabled from the database on every tick (D5)', async () => {
    // Fresh state from beforeEach: usgs and gdacs never polled → both due; simulated never is.
    expect((await polling.tick()).sort()).toEqual(['gdacs', 'usgs']);
    await polling.whenIdle();
    expect(await polling.tick()).toEqual([]);

    // An admin disables gdacs and shortens the usgs interval; the next tick follows.
    await api()
      .patch('/api/admin/event-sources/gdacs')
      .set('Authorization', admin.auth)
      .send({ enabled: false })
      .expect(200);
    await api()
      .patch('/api/admin/event-sources/usgs')
      .set('Authorization', admin.auth)
      .send({ intervalSec: 30 })
      .expect(200);
    // usgs: due only under the new 30 s interval, not the old 60 s.
    await prisma.eventSource.update({
      where: { key: 'usgs' },
      data: { lastPollAt: new Date(Date.now() - 31_000) },
    });
    // gdacs: its 300 s interval has long passed, so only the disabled flag keeps it out.
    await prisma.eventSource.update({
      where: { key: 'gdacs' },
      data: { lastPollAt: new Date(Date.now() - 600_000) },
    });
    expect(await polling.tick()).toEqual(['usgs']);
    await polling.whenIdle();
  });
});

describe('admin: Event Sources', () => {
  it('updates enabled, interval and Freshness Window', async () => {
    const response = await api()
      .patch('/api/admin/event-sources/usgs')
      .set('Authorization', admin.auth)
      .send({ enabled: false, intervalSec: 120, freshnessHours: 12 })
      .expect(200);
    expect(eventSourceSchema.parse(response.body)).toMatchObject({
      key: 'usgs',
      enabled: false,
      intervalSec: 120,
      freshnessHours: 12,
    });
    expect(await sourceRow('usgs')).toMatchObject({ enabled: false, intervalSec: 120 });
  });

  it.each([
    ['an interval below 30 s', 'usgs', { intervalSec: 5 }],
    ['a fractional interval', 'usgs', { intervalSec: 60.5 }],
    ['a Freshness Window of 0', 'usgs', { freshnessHours: 0 }],
    ['an unknown field', 'usgs', { lastError: null }],
    ['an empty update', 'usgs', {}],
    ['an interval for the Simulated Source', 'simulated', { intervalSec: 60 }],
    ['an unknown source', 'nasa', { enabled: false }],
  ])('rejects %s with 400 and changes nothing', async (_case, key, body) => {
    const before = await prisma.eventSource.findMany({ orderBy: { key: 'asc' } });
    await api()
      .patch(`/api/admin/event-sources/${key}`)
      .set('Authorization', admin.auth)
      .send(body)
      .expect(400);
    expect(await prisma.eventSource.findMany({ orderBy: { key: 'asc' } })).toEqual(before);
  });

  it('"poll now" on the Simulated Source answers 400 and records nothing (CR38)', async () => {
    await api()
      .post('/api/admin/event-sources/simulated/poll')
      .set('Authorization', admin.auth)
      .expect(400);
    expect((await sourceRow('simulated')).lastPollAt).toBeNull();
  });
});

describe('admin: Simulated Source', () => {
  const input: SimulatedEventInput = {
    category: 'market',
    severity: 3,
    title: 'Brent crude jumps 6% after OPEC surprise cut',
    summary: 'Simulated market move for the demo.',
    location: 'Global',
    url: null,
  };

  async function createSimulated(body: SimulatedEventInput = input) {
    const response = await api()
      .post('/api/admin/simulated-events')
      .set('Authorization', admin.auth)
      .send(body)
      .expect(201);
    return storedEventSchema.parse(response.body);
  }

  it('creates an Event through the ingestion path (revision + EventIngested)', async () => {
    const created = await createSimulated({ ...input, title: `e2e ${input.title}` });
    expect(created).toMatchObject({ source: 'simulated', severity: 3, category: 'market' });
    expect(created.externalId).toMatch(/^sim-/);

    const row = await prisma.event.findUniqueOrThrow({
      where: { id: created.id },
      include: { revisions: true, source: true },
    });
    expect(row.source.key).toBe('simulated');
    expect(row.revisions.map((r) => [r.previousSeverity, r.severity])).toEqual([[null, 3]]);
    expect(ingested.filter((e) => e.event.id === created.id)).toEqual([
      { event: created, previous: null },
    ]);
  });

  it('raising the Severity records a revision; saving it unchanged does nothing', async () => {
    const created = await createSimulated({ ...input, title: `e2e ${input.title}` });
    const raised = { ...input, title: `e2e ${input.title}`, severity: 5 } as const;

    const response = await api()
      .put(`/api/admin/simulated-events/${created.id}`)
      .set('Authorization', admin.auth)
      .send(raised)
      .expect(200);
    const updated = storedEventSchema.parse(response.body);
    expect(updated).toMatchObject({ id: created.id, severity: 5, externalId: created.externalId });
    // occurredAt is kept when the update doesn't give one.
    expect(updated.occurredAt).toEqual(created.occurredAt);

    await api()
      .put(`/api/admin/simulated-events/${created.id}`)
      .set('Authorization', admin.auth)
      .send(raised)
      .expect(200);

    const revisions = await prisma.eventRevision.findMany({
      where: { eventId: created.id },
      orderBy: { recordedAt: 'asc' },
    });
    expect(revisions.map((r) => [r.previousSeverity, r.severity])).toEqual([
      [null, 3],
      [3, 5],
    ]);
    const forEvent = ingested.filter((e) => e.event.id === created.id);
    expect(forEvent.map((e) => [e.previous?.severity ?? null, e.event.severity])).toEqual([
      [null, 3],
      [3, 5],
    ]);
  });

  it('answers 404 for an Event of another source or an unknown id', async () => {
    await pollNow('usgs');
    const [usgsEvent] = await eventsOf('usgs');
    for (const id of [usgsEvent?.id, randomUUID()]) {
      await api()
        .put(`/api/admin/simulated-events/${String(id)}`)
        .set('Authorization', admin.auth)
        .send(input)
        .expect(404);
    }
    expect((await eventsOf('usgs'))[0]?.title).toBe(usgsEvent?.title);
  });

  it('a disabled Simulated Source takes no Events: create and update answer 409 (CR37)', async () => {
    const created = await createSimulated({ ...input, title: `e2e ${input.title}` });
    await prisma.eventSource.update({ where: { key: 'simulated' }, data: { enabled: false } });

    await api()
      .post('/api/admin/simulated-events')
      .set('Authorization', admin.auth)
      .send({ ...input, title: `e2e ${input.title}` })
      .expect(409);
    await api()
      .put(`/api/admin/simulated-events/${created.id}`)
      .set('Authorization', admin.auth)
      .send({ ...input, title: `e2e ${input.title}`, severity: 5 })
      .expect(409);
    expect(await prisma.event.findUniqueOrThrow({ where: { id: created.id } })).toMatchObject({
      severity: 3,
    });
  });

  it('rejects an invalid Event with 400 (e.g. a javascript: link, Severity 6)', async () => {
    for (const body of [
      { ...input, url: 'javascript:alert(1)' },
      { ...input, severity: 6 },
      { ...input, title: '' },
    ]) {
      await api()
        .post('/api/admin/simulated-events')
        .set('Authorization', admin.auth)
        .send(body)
        .expect(400);
    }
  });
});

describe('admin routes are admin-only', () => {
  it('answers 403 to a non-admin on every new route', async () => {
    const alice = await registerUser(app, 'alice');
    const created = await api()
      .post('/api/admin/simulated-events')
      .set('Authorization', admin.auth)
      .send({
        category: 'news',
        severity: 2,
        title: 'e2e role check',
        summary: '',
        location: '',
        url: null,
      })
      .expect(201);
    const id = storedEventSchema.parse(created.body).id;

    await api()
      .patch('/api/admin/event-sources/usgs')
      .set('Authorization', alice.auth)
      .send({ enabled: false })
      .expect(403);
    await api()
      .post('/api/admin/event-sources/usgs/poll')
      .set('Authorization', alice.auth)
      .expect(403);
    await api()
      .post('/api/admin/simulated-events')
      .set('Authorization', alice.auth)
      .send({ category: 'news', severity: 5, title: 'e2e x', summary: '', location: '', url: null })
      .expect(403);
    await api()
      .put(`/api/admin/simulated-events/${id}`)
      .set('Authorization', alice.auth)
      .send({ category: 'news', severity: 5, title: 'e2e x', summary: '', location: '', url: null })
      .expect(403);

    expect(await sourceRow('usgs')).toMatchObject({ enabled: true });
    expect(await prisma.event.findUniqueOrThrow({ where: { id } })).toMatchObject({ severity: 2 });
    expect(await eventsOf('usgs')).toEqual([]);
  });
});

describe('shutdown', () => {
  it('a poll cut short by shutdown records nothing on the source (CR31)', async () => {
    const heldFetcher = new FixtureFetcher();
    heldFetcher.bodies.set(USGS_FEED_URL, usgsFixture(prefix));
    heldFetcher.gate = new Promise(() => {}); // never answers on its own
    const second = await createTestApp((builder) =>
      builder.overrideProvider(FeedFetcher).useValue(heldFetcher),
    );
    const poll = second.get(PollingService).poll('usgs');

    await second.close(); // aborts the held fetch and waits for the poll to finish

    expect(await poll).toMatchObject({ created: 0, error: 'Interrupted by shutdown' });
    expect(await sourceRow('usgs')).toMatchObject({ lastPollAt: null, lastError: null });
    expect(await eventsOf('usgs')).toEqual([]);
  });
});
