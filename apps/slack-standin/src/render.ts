import type { Block, TextObject } from './contract.ts';

export interface StoredMessage {
  id: number;
  channel: string;
  receivedAt: Date;
  text: string | null;
  blocks: Block[];
  raw: unknown;
}

export function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Slack text arrives with &, <, > escaped (formatting docs); undo that before HTML-escaping. */
function unescapeSlack(text: string): string {
  return text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}

function inlineMrkdwn(escaped: string): string {
  return escaped
    .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replaceAll('\n', '<br>');
}

/** Enough of Slack's mrkdwn for our messages: links `<url|label>`, *bold*, _italic_, `code`. */
export function renderMrkdwn(text: string): string {
  const link = /<([^>|]+)(?:\|([^>]*))?>/g;
  let html = '';
  let last = 0;
  for (const match of text.matchAll(link)) {
    html += inlineMrkdwn(escapeHtml(unescapeSlack(text.slice(last, match.index))));
    const url = unescapeSlack(match[1] ?? '');
    const label = escapeHtml(unescapeSlack(match[2] ?? url));
    html += /^(https?:|mailto:)/.test(url)
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${label}</a>`
      : label;
    last = match.index + match[0].length;
  }
  return html + inlineMrkdwn(escapeHtml(unescapeSlack(text.slice(last))));
}

function renderText(object: TextObject): string {
  return object.type === 'mrkdwn' ? renderMrkdwn(object.text) : escapeHtml(object.text);
}

function renderBlock(block: Block): string {
  switch (block.type) {
    case 'header':
      return `<h3 class="header">${renderText(block.text)}</h3>`;
    case 'section': {
      const text = block.text ? `<div>${renderText(block.text)}</div>` : '';
      const fields = block.fields
        ? `<div class="fields">${block.fields.map((f) => `<div>${renderText(f)}</div>`).join('')}</div>`
        : '';
      return `<div class="section">${text}${fields}</div>`;
    }
    case 'context':
      return `<div class="context">${block.elements.map((e) => `<span>${renderText(e)}</span>`).join('')}</div>`;
    case 'divider':
      return '<hr>';
  }
}

function renderMessage(message: StoredMessage): string {
  const body =
    message.blocks.length > 0
      ? message.blocks.map(renderBlock).join('')
      : `<div>${renderMrkdwn(message.text ?? '')}</div>`;
  return `<article class="message">
  <div class="meta"><span class="app">World Event Alerts</span> <span class="tag">APP</span>
    <time datetime="${message.receivedAt.toISOString()}">${message.receivedAt.toISOString().slice(11, 19)} UTC</time></div>
  ${body}
  <details><summary>Payload</summary><pre>${escapeHtml(JSON.stringify(message.raw, null, 2))}</pre></details>
</article>`;
}

const STYLE = `
body{margin:0;font:15px/1.46 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#1d1c1d;background:#fff;display:flex;min-height:100vh}
nav{width:220px;background:#3f0e40;color:#cfc3cf;padding:12px 0;flex-shrink:0}
nav h1{color:#fff;font-size:18px;margin:0 16px 4px}nav p{font-size:12px;margin:0 16px 16px;color:#bcabbc}
nav a{display:block;padding:4px 16px;color:inherit;text-decoration:none}nav a.active{background:#1164a3;color:#fff}
main{flex:1;min-width:0}
.banner{background:#fff4cc;border-bottom:1px solid #e8d48a;padding:8px 20px;font-size:13px}
.channel{padding:12px 20px;border-bottom:1px solid #ddd;font-weight:700;font-size:18px}
.message{padding:12px 20px;border-bottom:1px solid #f0f0f0}
.meta{margin-bottom:4px}.app{font-weight:700}.tag{font-size:10px;background:#e8e8e8;padding:1px 3px;border-radius:2px;color:#616061}
time{color:#616061;font-size:12px;margin-left:6px}
.header{margin:4px 0;font-size:17px}.section{margin:6px 0}.fields{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-top:6px}
.context{color:#616061;font-size:13px;margin:6px 0;display:flex;flex-wrap:wrap;gap:4px 12px}a{color:#1264a3}code{background:#f6f6f6;border:1px solid #ddd;padding:0 3px;border-radius:3px}
details{margin-top:6px;font-size:12px;color:#616061}pre{white-space:pre-wrap;background:#f8f8f8;padding:8px}
.empty{padding:40px 20px;color:#616061}
@media (max-width:640px){nav{display:none}.fields{grid-template-columns:1fr}}`;

/** The web view: Slack-like enough to read a demo screenshot, labelled as a stand-in. */
export function renderPage(messages: StoredMessage[], channel: string | null): string {
  const channels = [...new Set(messages.map((m) => m.channel))].sort();
  const shown = channel ? messages.filter((m) => m.channel === channel) : messages;
  const links = [
    `<a href="/" class="${channel === null ? 'active' : ''}"># all channels</a>`,
    ...channels.map(
      (c) =>
        `<a href="/?channel=${encodeURIComponent(c)}" class="${c === channel ? 'active' : ''}"># ${escapeHtml(c)}</a>`,
    ),
  ].join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="3"><title>sonrisa · Slack Stand-in</title><style>${STYLE}</style></head>
<body><nav><h1>sonrisa</h1><p>Slack Stand-in</p>${links}</nav>
<main><div class="banner">Local stand-in for Slack Incoming Webhooks. This is not a real Slack workspace; messages live in memory until restart.</div>
<div class="channel"># ${escapeHtml(channel ?? 'all channels')}</div>
${shown.length === 0 ? '<p class="empty">No messages yet.</p>' : shown.map(renderMessage).join('\n')}
</main></body></html>`;
}
