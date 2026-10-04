import { describe, expect, it } from 'vitest';
import { checkWebhookPayload } from './contract.ts';

const header = (text: string) => ({ type: 'header', text: { type: 'plain_text', text } });
const mrkdwn = (text: string) => ({ type: 'mrkdwn', text });

describe('checkWebhookPayload', () => {
  it('accepts text only, blocks only, and both', () => {
    expect(checkWebhookPayload({ text: 'hi' }).ok).toBe(true);
    expect(checkWebhookPayload({ blocks: [header('Hi')] }).ok).toBe(true);
    expect(
      checkWebhookPayload({
        text: 'fallback',
        blocks: [
          header('Title'),
          { type: 'section', text: mrkdwn('*bold*'), fields: [mrkdwn('a'), mrkdwn('b')] },
          { type: 'context', elements: [mrkdwn('src')] },
          { type: 'divider' },
        ],
      }),
    ).toMatchObject({ ok: true });
  });

  it('answers no_text when there is neither text nor blocks', () => {
    expect(checkWebhookPayload({})).toMatchObject({ ok: false, error: 'no_text' });
    expect(checkWebhookPayload({ text: '', blocks: [] })).toMatchObject({ error: 'no_text' });
  });

  it.each([
    ['not an object', 'hello'],
    ['unknown top-level field', { text: 'x', attachmentz: [] }],
    ['unknown block type', { blocks: [{ type: 'carousel' }] }],
    ['made-up block field', { blocks: [{ ...header('x'), color: 'red' }] }],
    ['mrkdwn header', { blocks: [{ type: 'header', text: mrkdwn('x') }] }],
    ['header over 150', { blocks: [header('x'.repeat(151))] }],
    ['section text over 3000', { blocks: [{ type: 'section', text: mrkdwn('x'.repeat(3001)) }] }],
    ['11 fields', { blocks: [{ type: 'section', fields: Array(11).fill(mrkdwn('f')) }] }],
    ['field over 2000', { blocks: [{ type: 'section', fields: [mrkdwn('x'.repeat(2001))] }] }],
    ['empty section', { blocks: [{ type: 'section' }] }],
    ['empty text', { blocks: [{ type: 'section', text: mrkdwn('') }] }],
    ['emoji on mrkdwn', { blocks: [{ type: 'section', text: { ...mrkdwn('x'), emoji: true } }] }],
    [
      '11 context elements',
      { blocks: [{ type: 'context', elements: Array(11).fill(mrkdwn('c')) }] },
    ],
    ['51 blocks', { blocks: Array(51).fill({ type: 'divider' }) }],
    ['block_id over 255', { blocks: [{ type: 'divider', block_id: 'b'.repeat(256) }] }],
  ])('rejects %s as invalid_payload', (_name, body) => {
    expect(checkWebhookPayload(body)).toMatchObject({
      ok: false,
      status: 400,
      error: 'invalid_payload',
    });
  });

  it('accepts the documented limits exactly', () => {
    expect(
      checkWebhookPayload({
        blocks: [
          header('x'.repeat(150)),
          {
            type: 'section',
            text: mrkdwn('x'.repeat(3000)),
            fields: Array(10).fill(mrkdwn('y'.repeat(2000))),
          },
          ...Array.from({ length: 48 }, () => ({ type: 'divider', block_id: 'b'.repeat(255) })),
        ],
      }).ok,
    ).toBe(true);
  });
});
