import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startStandin, type Standin } from './server.ts';

let standin: Standin;
beforeAll(async () => {
  standin = await startStandin(0, '127.0.0.1');
});
afterAll(() => standin.close());
beforeEach(async () => {
  await fetch(`${standin.url}/api/messages`, { method: 'DELETE' });
});

const post = (path: string, body: unknown) =>
  fetch(`${standin.url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('Slack Stand-in server', () => {
  it('answers 200 "ok" like Slack and stores the message per channel', async () => {
    const response = await post('/hooks/world-alerts', { text: 'Quake & <aftershock>' });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');

    const messages: unknown = await (await fetch(`${standin.url}/api/messages`)).json();
    expect(messages).toMatchObject([{ channel: 'world-alerts', text: 'Quake & <aftershock>' }]);

    const page = await (await fetch(`${standin.url}/?channel=world-alerts`)).text();
    expect(page).toContain('Quake &amp; &lt;aftershock&gt;');
    expect(page).toContain('not a real Slack workspace');
  });

  it("answers Slack's error codes and stores nothing", async () => {
    const bad = await post('/hooks/world-alerts', '{not json');
    expect([bad.status, await bad.text()]).toEqual([400, 'invalid_payload']);
    const empty = await post('/hooks/world-alerts', {});
    expect([empty.status, await empty.text()]).toEqual([400, 'no_text']);
    const unknownHook = await post('/hooks/Bad Name', { text: 'x' });
    expect(unknownHook.status).toBe(404);
    expect(await (await fetch(`${standin.url}/api/messages`)).json()).toEqual([]);
  });

  it('answers injected failures with Retry-After, then recovers', async () => {
    expect((await post('/api/failures', { status: 429, retryAfter: 2, count: 2 })).status).toBe(
      204,
    );
    for (let i = 0; i < 2; i++) {
      const limited = await post('/hooks/world-alerts', { text: 'x' });
      expect(limited.status).toBe(429);
      expect(limited.headers.get('retry-after')).toBe('2');
    }
    expect((await post('/hooks/world-alerts', { text: 'x' })).status).toBe(200);
  });

  it('renders mrkdwn links only for http(s) and mailto', async () => {
    await post('/hooks/world-alerts', {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '<https://usgs.gov/e?a=1&amp;b=2|USGS> <javascript:alert(1)|bad>',
          },
        },
      ],
    });
    const page = await (await fetch(standin.url)).text();
    expect(page).toContain('<a href="https://usgs.gov/e?a=1&amp;b=2"');
    expect(page).not.toContain('href="javascript');
  });
});
