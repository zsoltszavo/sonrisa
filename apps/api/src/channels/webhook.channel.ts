import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { errorMessage } from '../common/error-message.js';
import type { Env } from '../config/env.js';
import { type ChannelProvider, DeliveryError, type DeliveryMessage } from './channel-provider.js';
import { headline, TEST_TEXT, truncate } from './message.js';
import { parseRetryAfter } from './slack.channel.js';

const SEND_TIMEOUT_MS = 15_000;
/** Enough of an error body to explain a refusal; the rest is never read. */
const MAX_ERROR_BODY_BYTES = 1024;
const USER_AGENT = 'WorldEventAlerts-Webhook/1';

/**
 * Addresses a webhook must never reach (D24): the IANA special-purpose ranges (loopback, private,
 * link-local incl. cloud metadata 169.254.169.254, CGNAT, documentation, multicast, reserved) and
 * the IPv6 forms that embed or translate an IPv4 address (NAT64, 6to4, Teredo). An IPv4-mapped
 * address (`::ffff:10.0.0.1`) needs no rule of its own: `BlockList` checks it against the IPv4 ones
 * (a `::ffff:0:0/96` rule would block every IPv4 address too).
 */
const BLOCKED = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.31.196.0', 24], // AS112
  ['192.52.193.0', 24], // AMT
  ['192.168.0.0', 16],
  ['192.175.48.0', 24], // AS112 direct delegation
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 96], // unspecified, loopback, IPv4-compatible
  ['64:ff9b::', 96], // NAT64
  ['64:ff9b:1::', 48], // local-use NAT64
  ['100::', 64], // discard-only
  ['2001::', 23], // IETF protocol assignments, incl. Teredo
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4
  ['2620:4f:8000::', 48], // AS112
  ['3fff::', 20], // documentation (RFC 9637)
  ['5f00::', 16], // SRv6 SIDs
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  BLOCKED.addSubnet(network, prefix, 'ipv6');
}

/** True for an address a webhook may not reach; anything that isn't an IP address fails closed. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  return BLOCKED.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/**
 * The resolved address of a webhook host is not public: permanent, the URL itself is the problem.
 * The message leaves the address out: "Send test" shows it to the user, who shouldn't learn what
 * internal names resolve to (CR93).
 */
export class BlockedAddressError extends Error {
  constructor(hostname: string) {
    super(`${hostname} does not resolve to a public address`);
    this.name = 'BlockedAddressError';
  }
}

/**
 * The URL rules checked on save (400) and again before every send (D24). `allowedOrigins` are exact
 * origins exempt from them (a local receiver in dev and e2e; empty by default).
 */
export function webhookEndpointProblem(
  url: string,
  allowedOrigins: readonly string[],
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Endpoint URL is not a valid URL';
  }
  if (parsed.username || parsed.password) return 'Endpoint URL must not contain credentials';
  if (allowedOrigins.includes(parsed.origin)) return null;
  if (parsed.protocol !== 'https:') return 'Endpoint URL must use https://';
  // WHATWG URL already turned "2130706433" or "0x7f.1" into dotted IPv4; IPv6 keeps its brackets.
  const host = parsed.hostname.replace(/^\[(.*)\]$/, '$1').replace(/\.$/, '');
  if (isIP(host) !== 0) {
    return isBlockedAddress(host) ? 'Endpoint URL must point at a public address' : null;
  }
  if (host === 'localhost' || host.endsWith('.localhost') || !host.includes('.')) {
    return 'Endpoint URL must use a public host name';
  }
  return null;
}

/** `dns.lookup` with every option this module passes; injectable so tests can resolve to anything. */
export type ResolveAll = (
  hostname: string,
  options: dns.LookupAllOptions,
  callback: (error: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void,
) => void;

/**
 * A `lookup` for `http.request` that refuses a host when **any** of its addresses is blocked. The
 * socket connects to the address checked here, so DNS can't answer differently between the check
 * and the connection (rebinding). IP-literal hosts never reach a lookup: the URL rules cover them.
 */
export function checkedLookup(resolve: ResolveAll = dns.lookup): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) {
        callback(error, '');
        return;
      }
      const blocked = addresses.find(({ address }) => isBlockedAddress(address));
      const first = addresses[0];
      if (blocked || !first) {
        callback(new BlockedAddressError(hostname), '');
        return;
      }
      if (options.all) callback(null, addresses);
      else callback(null, first.address, first.family);
    });
  };
}

export interface WebhookResponse {
  status: number;
  retryAfter: string | null;
  /** At most MAX_ERROR_BODY_BYTES; only read for a non-2xx answer. */
  body: string;
}

/** One POST, no redirects followed (a redirect could lead past the URL rules). */
export function postJson(
  url: string,
  body: string,
  headers: Record<string, string>,
  options: { lookup: LookupFunction | undefined; signal: AbortSignal },
): Promise<WebhookResponse> {
  const { request } = new URL(url).protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    // Set once the status line is in. From then on the status decides the outcome: an error body
    // that stalls until the timeout or breaks off only loses detail (review CR70).
    let answered: (() => void) | undefined;
    const req = request(
      url,
      {
        method: 'POST',
        headers: { ...headers, 'content-length': String(Buffer.byteLength(body)) },
        lookup: options.lookup,
        signal: options.signal,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const retryAfter = res.headers['retry-after'] ?? null;
        const chunks: Buffer[] = [];
        let size = 0;
        answered = () => {
          resolve({ status, retryAfter, body: Buffer.concat(chunks).toString('utf8') });
        };
        if (status >= 200 && status < 300) {
          res.resume();
          answered();
          return;
        }
        res.on('data', (chunk: Buffer) => {
          // Only what fits is kept, so one large chunk can't hold more than the cap (CR78).
          const kept = chunk.subarray(0, MAX_ERROR_BODY_BYTES - size);
          chunks.push(kept);
          size += kept.length;
          if (size >= MAX_ERROR_BODY_BYTES) {
            answered?.();
            res.destroy();
          }
        });
        res.on('end', answered);
        res.on('error', answered);
        res.on('close', answered);
      },
    );
    // A Promise settles once, so the later calls of `answered` (end, then close) are no-ops.
    req.on('error', (error) => {
      if (answered) answered();
      else reject(error);
    });
    req.end(body);
  });
}

/**
 * The JSON body (D24). `id` is stable per Notification and repeated as `Idempotency-Key`, so a
 * receiver can drop the duplicate that at-least-once delivery (D21(a)) can produce.
 */
export function renderWebhookPayload(message: DeliveryMessage) {
  const destination = { label: message.destinationLabel };
  if (message.type === 'test') {
    return { type: 'test' as const, text: headline(message), message: TEST_TEXT, destination };
  }
  const { event } = message;
  return {
    type: 'notification' as const,
    id: message.notificationId,
    kind: message.kind,
    text: headline(message),
    /** The Severity this Notification reports; `event.severity` is the Event's current one. */
    severity: message.severity,
    previousSeverity: message.previousSeverity,
    ruleCount: message.ruleCount,
    event: {
      id: event.id,
      source: event.source,
      externalId: event.externalId,
      category: event.category,
      severity: event.severity,
      title: event.title,
      summary: event.summary,
      location: event.location,
      url: event.url,
      occurredAt: event.occurredAt.toISOString(),
    },
    destination,
  };
}

const oneLine = (text: string): string => truncate(text.replace(/\s+/g, ' ').trim(), 200);

/**
 * D21(b) for a generic receiver: 408/429/5xx can pass on a later attempt, every other answer
 * won't. Any retryable answer may carry `Retry-After` (a 503 during maintenance, CR73).
 */
export function deliveryErrorFor(response: WebhookResponse, now: Date): DeliveryError {
  const { status } = response;
  const body = oneLine(response.body);
  const reason = `Webhook answered ${String(status)}${body ? ` ${body}` : ''}`;
  if (status >= 300 && status < 400) {
    return new DeliveryError(`${reason} (redirects are not followed)`, false);
  }
  const retryable = status === 408 || status === 429 || status >= 500;
  return retryable
    ? new DeliveryError(reason, true, parseRetryAfter(response.retryAfter, now))
    : new DeliveryError(reason, false);
}

/**
 * A request that got no answer. A blocked address or a name that doesn't exist (`ENOTFOUND`, a
 * typo in the host, CR74) won't change by retrying; a refused connection, a timeout or a resolver
 * that is down for now (`EAI_AGAIN`) can.
 */
export function deliveryErrorForTransport(error: unknown): DeliveryError {
  if (error instanceof BlockedAddressError) return new DeliveryError(error.message, false);
  const code = error instanceof Error && 'code' in error ? error.code : undefined;
  if (code === 'ENOTFOUND') {
    return new DeliveryError(`Webhook host not found: ${errorMessage(error)}`, false);
  }
  return new DeliveryError(`Webhook unreachable: ${errorMessage(error)}`, true);
}

/** Any HTTPS endpoint that accepts a JSON POST (D11's extensibility proof, D24). */
@Injectable()
export class WebhookChannel implements ChannelProvider<{ webhookUrl: string }> {
  readonly key = 'webhook';
  readonly name = 'Webhook';
  readonly configSchema;
  private readonly allowedOrigins: readonly string[];

  constructor(config: ConfigService<Env, true>) {
    this.allowedOrigins = config.get('WEBHOOK_ALLOWED_ORIGINS', { infer: true });
    this.configSchema = z.strictObject({
      // `webhookUrl`, like Slack's: destination lists summarise that field by its host only.
      webhookUrl: z
        .url({ protocol: /^https?$/, abort: true })
        .superRefine((url, ctx) => {
          const problem = webhookEndpointProblem(url, this.allowedOrigins);
          if (problem) ctx.addIssue({ code: 'custom', message: problem });
        })
        .meta({
          title: 'Endpoint URL',
          description:
            'An https:// address on the public internet. Each alert is POSTed to it as JSON.',
        }),
    });
  }

  async send(
    config: { webhookUrl: string },
    message: DeliveryMessage,
    signal: AbortSignal,
  ): Promise<void> {
    // The URL rules already ran (`ChannelRegistry` re-validates before every send); the lookup
    // checks what the host name resolves to, except for the exempt dev/e2e origins.
    const exempt = this.allowedOrigins.includes(new URL(config.webhookUrl).origin);
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'user-agent': USER_AGENT,
      ...(message.type === 'notification' ? { 'idempotency-key': message.notificationId } : {}),
    };
    let response: WebhookResponse;
    try {
      response = await postJson(
        config.webhookUrl,
        JSON.stringify(renderWebhookPayload(message)),
        headers,
        {
          lookup: exempt ? undefined : checkedLookup(),
          signal: AbortSignal.any([signal, AbortSignal.timeout(SEND_TIMEOUT_MS)]),
        },
      );
    } catch (error) {
      if (signal.aborted) throw error;
      throw deliveryErrorForTransport(error);
    }
    if (response.status >= 200 && response.status < 300) return;
    throw deliveryErrorFor(response, new Date());
  }
}
