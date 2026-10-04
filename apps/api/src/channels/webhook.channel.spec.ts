import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import { once } from 'node:events';
import { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import { DeliveryError, type DeliveryMessage } from './channel-provider.js';
import {
  BlockedAddressError,
  checkedLookup,
  deliveryErrorFor,
  deliveryErrorForTransport,
  isBlockedAddress,
  postJson,
  renderWebhookPayload,
  type ResolveAll,
  WebhookChannel,
  webhookEndpointProblem,
} from './webhook.channel.js';

const escalation = {
  type: 'notification',
  notificationId: 'n-1',
  kind: 'escalation',
  event: {
    id: 'e-1',
    source: 'usgs',
    externalId: 'us7000abcd',
    category: 'earthquake',
    severity: 5,
    title: 'M 7.1 - 20 km S of Somewhere',
    summary: 'Shaking felt <widely> & strongly',
    location: '20 km S of Somewhere',
    url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd',
    occurredAt: new Date('2026-10-04T16:40:00Z'),
  },
  severity: 4,
  previousSeverity: 3,
  ruleCount: 2,
  destinationLabel: 'Ops webhook',
} satisfies DeliveryMessage;

/** The documented body (D24), written independently of the renderer; strict, so extra fields fail. */
const severity = z.int().min(1).max(5);
const notificationPayload = z.strictObject({
  type: z.literal('notification'),
  id: z.string().min(1),
  kind: z.enum(['match', 'escalation']),
  text: z.string().min(1),
  severity,
  previousSeverity: severity.nullable(),
  ruleCount: z.int().positive(),
  event: z.strictObject({
    id: z.string(),
    source: z.string(),
    externalId: z.string(),
    category: z.string(),
    severity,
    title: z.string(),
    summary: z.string(),
    location: z.string(),
    url: z.string().nullable(),
    occurredAt: z.iso.datetime(),
  }),
  destination: z.strictObject({ label: z.string() }),
});
const testPayload = z.strictObject({
  type: z.literal('test'),
  text: z.string().min(1),
  message: z.string().min(1),
  destination: z.strictObject({ label: z.string() }),
});

describe('renderWebhookPayload', () => {
  it('sends a Notification as plain JSON data, with the Severity it reports', () => {
    // Through JSON, as the receiver sees it.
    const body: unknown = JSON.parse(JSON.stringify(renderWebhookPayload(escalation)));
    const payload = notificationPayload.parse(body);
    expect(payload).toMatchObject({
      id: 'n-1',
      kind: 'escalation',
      text: 'Escalated to Severe (4/5): M 7.1 - 20 km S of Somewhere',
      severity: 4,
      previousSeverity: 3,
      ruleCount: 2,
      destination: { label: 'Ops webhook' },
    });
    // Raw text, not escaped: escaping is the receiver's job for whatever it renders into.
    expect(payload.event).toMatchObject({
      severity: 5,
      summary: 'Shaking felt <widely> & strongly',
      occurredAt: '2026-10-04T16:40:00.000Z',
    });
  });

  it('sends a "send test" as its own type', () => {
    const payload = testPayload.parse(
      JSON.parse(JSON.stringify(renderWebhookPayload({ type: 'test', destinationLabel: 'Ops' }))),
    );
    expect(payload.text).toBe('Test message for "Ops"');
    expect(payload.message).toContain('this Channel Destination works');
  });
});

describe('webhookEndpointProblem (URL rules, D24)', () => {
  const allowed = ['http://localhost:4012'];

  it.each([
    'https://example.com/hooks/alerts?token=abc',
    'https://example.com:8443/hook',
    'https://8.8.8.8/hook',
    'https://[2606:4700:4700::1111]/hook',
    'http://localhost:4012/anything',
  ])('accepts %s', (url) => {
    expect(webhookEndpointProblem(url, allowed)).toBeNull();
  });

  it.each([
    ['http://example.com/hook', 'must use https://'],
    ['http://localhost:4013/hook', 'must use https://'],
    ['https://user:pass@example.com/', 'must not contain credentials'],
    ['https://localhost/hook', 'public host name'],
    ['https://localhost./hook', 'public host name'],
    ['https://api.localhost/hook', 'public host name'],
    ['https://intranet/hook', 'public host name'],
    ['https://127.0.0.1/hook', 'public address'],
    ['https://2130706433/hook', 'public address'],
    ['https://0x7f.1/hook', 'public address'],
    ['https://169.254.169.254/latest/meta-data', 'public address'],
    ['https://10.1.2.3/', 'public address'],
    ['https://192.168.0.10/', 'public address'],
    ['https://[::1]/', 'public address'],
    ['https://[::ffff:127.0.0.1]/', 'public address'],
    ['https://[fd00::1]/', 'public address'],
    ['not a url', 'not a valid URL'],
  ])('refuses %s', (url, problem) => {
    expect(webhookEndpointProblem(url, allowed)).toContain(problem);
  });
});

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.31.255.255',
    '100.64.0.1',
    '0.0.0.0',
    '::1',
    '::ffff:10.0.0.1',
    '64:ff9b::a00:1',
    'fe80::1',
    'not-an-ip',
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '172.32.0.1', '::ffff:8.8.8.8', '2606:4700:4700::1111'])(
    'allows %s',
    (address) => {
      expect(isBlockedAddress(address)).toBe(false);
    },
  );
});

describe('checkedLookup', () => {
  const resolvingTo =
    (...addresses: string[]): ResolveAll =>
    (_hostname, _options, callback) => {
      callback(
        null,
        addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })),
      );
    };
  const lookup = (resolve: ResolveAll, all: boolean) =>
    new Promise<unknown>((resolveResult, reject) => {
      checkedLookup(resolve)('hooks.example.com', { all }, (error, address) => {
        if (error) reject(error);
        else resolveResult(address);
      });
    });

  it('refuses a host when any of its addresses is private', async () => {
    await expect(lookup(resolvingTo('8.8.8.8', '10.0.0.5'), true)).rejects.toBeInstanceOf(
      BlockedAddressError,
    );
    await expect(lookup(resolvingTo(), false)).rejects.toBeInstanceOf(BlockedAddressError);
  });

  it('answers in the shape the caller asked for', async () => {
    await expect(lookup(resolvingTo('8.8.8.8'), false)).resolves.toBe('8.8.8.8');
    await expect(lookup(resolvingTo('8.8.8.8', '2606:4700::1'), true)).resolves.toEqual([
      { address: '8.8.8.8', family: 4 },
      { address: '2606:4700::1', family: 6 },
    ]);
  });
});

/** The port of a server listening on a TCP address (not a pipe). */
function portOf(server: Server): string {
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('not a TCP server');
  return String(address.port);
}

/** A real HTTP receiver on 127.0.0.1, exempt through WEBHOOK_ALLOWED_ORIGINS like dev and e2e. */
describe('WebhookChannel.send', () => {
  interface Answer {
    status: number;
    headers?: Record<string, string>;
    body?: string;
  }
  let server: Server;
  let origin: string;
  let answer: Answer;
  let requests: { headers: IncomingHttpHeaders; body: string }[];
  let channel: WebhookChannel;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        requests.push({ headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
        res.writeHead(answer.status, answer.headers).end(answer.body ?? '');
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    origin = `http://127.0.0.1:${portOf(server)}`;
    channel = new WebhookChannel(
      new ConfigService<Env, true>({ WEBHOOK_ALLOWED_ORIGINS: [origin] }),
    );
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    requests = [];
    answer = { status: 204 };
  });

  const send = (url = `${origin}/hook`) =>
    channel.send({ webhookUrl: url }, escalation, new AbortController().signal);
  const failure = async (url?: string): Promise<DeliveryError> => {
    const error: unknown = await send(url).then(
      () => null,
      (rejected: unknown) => rejected,
    );
    if (!(error instanceof DeliveryError))
      throw new Error(`expected a DeliveryError: ${String(error)}`);
    return error;
  };

  it('POSTs the JSON payload with an Idempotency-Key per Notification', async () => {
    await send();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.headers).toMatchObject({
      'content-type': 'application/json',
      'idempotency-key': 'n-1',
      'user-agent': 'WorldEventAlerts-Webhook/1',
    });
    expect(notificationPayload.parse(JSON.parse(requests[0]?.body ?? ''))).toMatchObject({
      id: 'n-1',
    });
  });

  it('retries a 429 with its Retry-After', async () => {
    answer = { status: 429, headers: { 'retry-after': '7' }, body: 'slow down' };
    expect(await failure()).toMatchObject({
      retryable: true,
      retryAfterSeconds: 7,
      message: 'Webhook answered 429 slow down',
    });
  });

  it.each([500, 503, 408])('retries a %i', async (status) => {
    answer = { status };
    expect(await failure()).toMatchObject({ retryable: true, retryAfterSeconds: null });
  });

  it.each([400, 401, 404, 410])('fails a %i at once', async (status) => {
    answer = { status, body: 'unknown hook' };
    expect(await failure()).toMatchObject({
      retryable: false,
      message: `Webhook answered ${String(status)} unknown hook`,
    });
  });

  it('fails a redirect at once without following it', async () => {
    answer = { status: 301, headers: { location: 'http://169.254.169.254/' } };
    expect(await failure()).toMatchObject({
      retryable: false,
      message: 'Webhook answered 301 (redirects are not followed)',
    });
    expect(requests).toHaveLength(1);
  });

  it('keeps only the start of a long error body, on one line', async () => {
    answer = { status: 400, body: `bad\n${'x'.repeat(5000)}` };
    const { message } = await failure();
    expect(message.startsWith('Webhook answered 400 bad xxx')).toBe(true);
    expect(message.length).toBeLessThan(260);
  });

  it('retries when nothing listens', async () => {
    const closed = createServer();
    closed.listen(0, '127.0.0.1');
    await once(closed, 'listening');
    const port = portOf(closed);
    closed.close();
    const refused = new WebhookChannel(
      new ConfigService<Env, true>({
        WEBHOOK_ALLOWED_ORIGINS: [`http://127.0.0.1:${port}`],
      }),
    );
    const error: unknown = await refused
      .send({ webhookUrl: `http://127.0.0.1:${port}/` }, escalation, new AbortController().signal)
      .catch((rejected: unknown) => rejected);
    expect(error).toMatchObject({ retryable: true });
    expect(String(error)).toContain('Webhook unreachable');
  });

  it('fails at once, before connecting, when a host name resolves to a private address', async () => {
    // Not exempt, so the real resolver runs: localhost → 127.0.0.1 / ::1.
    expect(await failure('https://localhost:1/hook')).toMatchObject({
      retryable: false,
      message: expect.stringContaining('which is not a public address') as unknown,
    });
  });

  it('never connects when the lookup refuses the resolved address', async () => {
    const port = new URL(origin).port;
    const viaLookup = postJson(
      `http://receiver.example:${port}/`,
      '{}',
      {},
      {
        lookup: checkedLookup((_hostname, _options, callback) => {
          callback(null, [{ address: '127.0.0.1', family: 4 }]);
        }),
        signal: new AbortController().signal,
      },
    );
    await expect(viaLookup).rejects.toBeInstanceOf(BlockedAddressError);
    expect(requests).toHaveLength(0);
  });
});

describe('postJson (review CR70, CR78)', () => {
  let server: Server;
  let url: string;
  let respond: (res: ServerResponse) => void;

  beforeAll(async () => {
    server = createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        respond(res);
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    url = `http://127.0.0.1:${portOf(server)}/`;
  });

  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  const post = (signal = new AbortController().signal) =>
    postJson(url, '{}', {}, { lookup: undefined, signal });

  it('keeps the status when an error body stalls until the timeout', async () => {
    respond = (res) => {
      res.writeHead(404);
      res.write('no such ');
    };
    await expect(post(AbortSignal.timeout(300))).resolves.toMatchObject({ status: 404 });
  });

  it('keeps at most 1 KiB of an error body, even from one large chunk', async () => {
    respond = (res) => {
      res.writeHead(500).end('x'.repeat(100_000));
    };
    const response = await post();
    expect(response.status).toBe(500);
    expect(response.body.length).toBe(1024);
  });
});

describe('deliveryErrorFor / deliveryErrorForTransport', () => {
  const now = new Date('2026-10-04T12:00:00Z');

  it('honours Retry-After on any retryable answer, not only 429 (CR73)', () => {
    expect(deliveryErrorFor({ status: 503, retryAfter: '120', body: '' }, now)).toMatchObject({
      retryable: true,
      retryAfterSeconds: 120,
    });
    expect(deliveryErrorFor({ status: 404, retryAfter: '120', body: '' }, now)).toMatchObject({
      retryable: false,
      retryAfterSeconds: null,
    });
  });

  const withCode = (code: string) =>
    Object.assign(new Error(`getaddrinfo ${code} x.example`), { code });

  it.each([
    ['a blocked address', new BlockedAddressError('x.example', '10.0.0.1'), false],
    ['a host that does not exist (CR74)', withCode('ENOTFOUND'), false],
    ['a resolver that is down for now', withCode('EAI_AGAIN'), true],
    ['a refused connection', withCode('ECONNREFUSED'), true],
  ])('maps %s', (_what, error, retryable) => {
    expect(deliveryErrorForTransport(error)).toMatchObject({ retryable });
  });
});
