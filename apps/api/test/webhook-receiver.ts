import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { once } from 'node:events';
import { pathToFileURL } from 'node:url';

/**
 * A local endpoint for the Webhook channel (D24): stores every POST and answers 204, or the
 * failures queued with `fail()`. Imported by `webhook.e2e-spec.ts`; also runs on its own for
 * dev demos (`node apps/api/test/webhook-receiver.ts 4012`, then `GET /received`), with
 * `WEBHOOK_ALLOWED_ORIGINS=http://localhost:4012` on the API.
 */
export interface ReceivedWebhook {
  path: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

interface QueuedFailure {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export interface WebhookReceiver {
  received: ReceivedWebhook[];
  /** The next `count` POSTs answer `status` instead of 204 (and are not stored). */
  fail(status: number, count: number, body?: string, headers?: Record<string, string>): void;
  close(): Promise<void>;
}

export async function startWebhookReceiver(port: number): Promise<WebhookReceiver> {
  const received: ReceivedWebhook[] = [];
  const failures: QueuedFailure[] = [];
  const server: Server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/received') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(received, null, 2));
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const failure = req.method === 'POST' ? failures.shift() : undefined;
      if (failure) {
        res.writeHead(failure.status, failure.headers);
        res.end(failure.body);
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(405).end();
        return;
      }
      const text = Buffer.concat(chunks).toString('utf8');
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        res.writeHead(400).end('body is not JSON');
        return;
      }
      received.push({ path: req.url ?? '/', headers: req.headers, body });
      if (isMain) console.log(JSON.stringify({ path: req.url, body }));
      res.writeHead(204).end();
    });
  });
  server.listen(port);
  await once(server, 'listening');
  return {
    received,
    fail(status, count, body = '', headers = {}) {
      for (let i = 0; i < count; i += 1) failures.push({ status, body, headers });
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
        server.closeAllConnections();
      }),
  };
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.argv[2] ?? '4012');
  await startWebhookReceiver(port);
  console.log(`webhook receiver listening on http://localhost:${String(port)}`);
}
