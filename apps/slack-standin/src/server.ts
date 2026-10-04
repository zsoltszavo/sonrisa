import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { checkWebhookPayload, isRecord } from './contract.ts';
import { renderPage, type StoredMessage } from './render.ts';

/** Kept in memory; the oldest messages go first. */
const MAX_MESSAGES = 500;
const MAX_BODY_BYTES = 1_000_000;

/** A failure the next webhook POSTs answer with, so retries and 429 handling can be demoed. */
interface InjectedFailure {
  status: number;
  retryAfter: number | null;
  remaining: number;
}

export interface Standin {
  server: Server;
  url: string;
  close(): Promise<void>;
}

class BodyTooLarge extends Error {}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new BodyTooLarge();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function send(
  res: ServerResponse,
  status: number,
  body: string,
  type = 'text/plain; charset=utf-8',
  headers: Record<string, string> = {},
): void {
  res.writeHead(status, { 'content-type': type, ...headers });
  res.end(body);
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    // Not JSON: the caller answers Slack's `invalid_payload`.
    return { ok: false };
  }
}

export function createStandin(): Server {
  const messages: StoredMessage[] = [];
  let nextId = 1;
  let failure: InjectedFailure | null = null;

  async function handleHook(req: IncomingMessage, res: ServerResponse, channel: string) {
    if (failure && failure.remaining > 0) {
      failure.remaining -= 1;
      const { status, retryAfter } = failure;
      if (failure.remaining === 0) failure = null;
      const headers: Record<string, string> =
        retryAfter === null ? {} : { 'retry-after': String(retryAfter) };
      send(res, status, status === 429 ? 'rate_limited' : 'injected_failure', undefined, headers);
      return;
    }
    const parsed = parseJson(await readBody(req));
    if (!parsed.ok) {
      send(res, 400, 'invalid_payload');
      return;
    }
    const result = checkWebhookPayload(parsed.value);
    if (!result.ok) {
      // Slack answers only the code; the detail goes to the log to help debugging.
      console.warn(`#${channel}: ${result.error}: ${result.detail}`);
      send(res, result.status, result.error);
      return;
    }
    messages.push({
      id: nextId++,
      channel,
      receivedAt: new Date(),
      text: result.message.text ?? null,
      blocks: result.message.blocks ?? [],
      raw: parsed.value,
    });
    if (messages.length > MAX_MESSAGES) messages.shift();
    send(res, 200, 'ok');
  }

  async function handleFailures(req: IncomingMessage, res: ServerResponse) {
    const parsed = parseJson(await readBody(req));
    const value: unknown = parsed.ok ? parsed.value : null;
    if (!isRecord(value)) {
      send(res, 400, 'expected {"status": 429, "retryAfter": 2, "count": 1}');
      return;
    }
    const { status, retryAfter = null, count = 1 } = value;
    const valid =
      typeof status === 'number' &&
      status >= 400 &&
      status <= 599 &&
      (retryAfter === null || (typeof retryAfter === 'number' && retryAfter >= 0)) &&
      typeof count === 'number' &&
      Number.isInteger(count) &&
      count >= 0;
    if (!valid) {
      send(res, 400, 'expected {"status": 400–599, "retryAfter"?: seconds, "count"?: n}');
      return;
    }
    failure = count === 0 ? null : { status, retryAfter, remaining: count };
    res.writeHead(204).end();
  }

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://standin');
    const hook = /^\/hooks\/([a-z0-9][a-z0-9_-]{0,79})$/.exec(url.pathname)?.[1];
    if (hook !== undefined && req.method === 'POST') {
      await handleHook(req, res, hook);
    } else if (hook !== undefined) {
      send(res, 405, 'method_not_allowed');
    } else if (url.pathname.startsWith('/hooks/')) {
      send(res, 404, 'no_service');
    } else if (url.pathname === '/' && req.method === 'GET') {
      send(res, 200, renderPage(messages, url.searchParams.get('channel')), 'text/html');
    } else if (url.pathname === '/api/messages' && req.method === 'GET') {
      const body = messages.map(({ raw, ...rest }) => ({ ...rest, payload: raw }));
      send(res, 200, JSON.stringify(body), 'application/json');
    } else if (url.pathname === '/api/messages' && req.method === 'DELETE') {
      messages.length = 0;
      res.writeHead(204).end();
    } else if (url.pathname === '/api/failures' && req.method === 'POST') {
      await handleFailures(req, res);
    } else {
      send(res, 404, 'not_found');
    }
  }

  return createServer((req, res) => {
    route(req, res).catch((error: unknown) => {
      if (error instanceof BodyTooLarge) {
        send(res, 413, 'payload_too_large');
        return;
      }
      console.error(error);
      if (!res.headersSent) send(res, 500, 'internal_error');
    });
  });
}
export async function startStandin(port: number, host = '0.0.0.0'): Promise<Standin> {
  const server = createStandin();
  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected a TCP address');
  return {
    server,
    url: `http://localhost:${String(address.port)}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
