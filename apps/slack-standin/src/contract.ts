/**
 * The part of Slack's Incoming Webhook contract the Stand-in enforces, written from Slack's docs:
 * - https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks (fields, errors)
 * - https://docs.slack.dev/reference/block-kit/blocks (≤ 50 blocks; header ≤ 150 plain_text;
 *   section text ≤ 3000, ≤ 10 fields of ≤ 2000; context ≤ 10 elements; block_id ≤ 255)
 *
 * It is deliberately strict: a block type or field the Stand-in doesn't know is rejected, so a
 * made-up Block Kit field fails here instead of silently passing and failing on real Slack.
 */

export interface TextObject {
  type: 'plain_text' | 'mrkdwn';
  text: string;
}

export type Block =
  | { type: 'header'; text: TextObject }
  | { type: 'section'; text?: TextObject; fields?: TextObject[] }
  | { type: 'context'; elements: TextObject[] }
  | { type: 'divider' };

export interface WebhookMessage {
  text?: string;
  blocks?: Block[];
}

/** Slack's error codes for webhooks: answered as plain text with the given HTTP status. */
export type ContractResult =
  | { ok: true; message: WebhookMessage }
  | { ok: false; status: 400; error: 'invalid_payload' | 'no_text'; detail: string };

const TOP_LEVEL_FIELDS = new Set([
  'text',
  'blocks',
  'mrkdwn',
  'unfurl_links',
  'unfurl_media',
  'thread_ts',
  // Listed by Slack but ignored for webhooks (the app's settings win); accepted, not used.
  'username',
  'icon_emoji',
  'icon_url',
  'channel',
]);

class ContractError extends Error {}

function fail(detail: string): never {
  throw new ContractError(detail);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, allowed: string[], where: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(`${where}: unknown field "${key}"`);
  }
}

function textObject(
  value: unknown,
  where: string,
  max: number,
  types: TextObject['type'][] = ['plain_text', 'mrkdwn'],
): TextObject {
  if (!isRecord(value)) fail(`${where}: must be a text object`);
  const { type, text } = value;
  if (type !== 'plain_text' && type !== 'mrkdwn') fail(`${where}.type: unknown "${String(type)}"`);
  if (!types.includes(type)) fail(`${where}.type: must be ${types.join(' or ')}`);
  // `emoji` is only valid on plain_text, `verbatim` only on mrkdwn (text object reference).
  onlyKeys(value, ['type', 'text', type === 'plain_text' ? 'emoji' : 'verbatim'], where);
  if (typeof text !== 'string' || text.length === 0) fail(`${where}.text: must be non-empty`);
  if (text.length > max) fail(`${where}.text: ${String(text.length)} > ${String(max)} characters`);
  return { type, text };
}

function blockId(value: Record<string, unknown>, where: string): void {
  const id = value.block_id;
  if (id !== undefined && (typeof id !== 'string' || id.length === 0 || id.length > 255)) {
    fail(`${where}.block_id: 1–255 characters`);
  }
}

function block(value: unknown, where: string): Block {
  if (!isRecord(value)) fail(`${where}: must be an object`);
  blockId(value, where);
  switch (value.type) {
    case 'header':
      onlyKeys(value, ['type', 'block_id', 'text'], where);
      return { type: 'header', text: textObject(value.text, `${where}.text`, 150, ['plain_text']) };
    case 'section': {
      onlyKeys(value, ['type', 'block_id', 'text', 'fields'], where);
      const section: Block = { type: 'section' };
      if (value.text !== undefined) section.text = textObject(value.text, `${where}.text`, 3000);
      if (value.fields !== undefined) {
        if (!Array.isArray(value.fields) || value.fields.length === 0 || value.fields.length > 10) {
          fail(`${where}.fields: 1–10 text objects`);
        }
        section.fields = value.fields.map((field: unknown, i) =>
          textObject(field, `${where}.fields[${String(i)}]`, 2000),
        );
      }
      if (!section.text && !section.fields) fail(`${where}: needs text or fields`);
      return section;
    }
    case 'context':
      onlyKeys(value, ['type', 'block_id', 'elements'], where);
      if (!Array.isArray(value.elements) || value.elements.length === 0) {
        fail(`${where}.elements: 1–10 elements`);
      }
      if (value.elements.length > 10) fail(`${where}.elements: 1–10 elements`);
      return {
        type: 'context',
        elements: value.elements.map((element: unknown, i) =>
          textObject(element, `${where}.elements[${String(i)}]`, 3000),
        ),
      };
    case 'divider':
      onlyKeys(value, ['type', 'block_id'], where);
      return { type: 'divider' };
    default:
      return fail(`${where}.type: unsupported block type "${String(value.type)}"`);
  }
}

/** Checks a parsed JSON body against the webhook contract. */
export function checkWebhookPayload(body: unknown): ContractResult {
  try {
    if (!isRecord(body)) fail('body must be a JSON object');
    for (const key of Object.keys(body)) {
      if (!TOP_LEVEL_FIELDS.has(key)) fail(`unknown top-level field "${key}"`);
    }
    const message: WebhookMessage = {};
    if (body.text !== undefined) {
      if (typeof body.text !== 'string') fail('text: must be a string');
      if (body.text !== '') message.text = body.text;
    }
    if (body.blocks !== undefined) {
      if (!Array.isArray(body.blocks)) fail('blocks: must be an array');
      if (body.blocks.length > 50) fail(`blocks: ${String(body.blocks.length)} > 50`);
      message.blocks = body.blocks.map((b: unknown, i) => block(b, `blocks[${String(i)}]`));
    }
    if (message.text === undefined && (message.blocks?.length ?? 0) === 0) {
      return { ok: false, status: 400, error: 'no_text', detail: 'text or blocks required' };
    }
    return { ok: true, message };
  } catch (error) {
    if (error instanceof ContractError) {
      return { ok: false, status: 400, error: 'invalid_payload', detail: error.message };
    }
    throw error;
  }
}
