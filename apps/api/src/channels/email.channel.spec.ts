import { describe, expect, it } from 'vitest';
import { renderEmail } from './email.channel.js';

describe('renderEmail', () => {
  const message = {
    type: 'notification',
    notificationId: 'n-1',
    kind: 'escalation',
    event: {
      id: 'e-1',
      source: 'simulated',
      externalId: 'sim-1',
      category: 'news',
      severity: 5,
      title: 'Strike at <port> & docks',
      summary: '<script>alert(1)</script>',
      location: '',
      url: 'https://example.test/a?x=1&y="2"',
      occurredAt: new Date('2026-10-04T16:40:00Z'),
    },
    severity: 5,
    previousSeverity: 3,
    ruleCount: 1,
    destinationLabel: 'My email',
  } as const;

  it('escapes Event text in the HTML part', () => {
    const { html } = renderEmail(message);
    expect(html).toContain('Strike at &lt;port&gt; &amp; docks');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('href="https://example.test/a?x=1&amp;y=&quot;2&quot;"');
  });

  it('marks an Escalation in the subject and both bodies, and leaves out an empty location', () => {
    const { subject, text, html } = renderEmail(message);
    expect(subject).toBe('Escalated to Critical (5/5): Strike at <port> & docks');
    expect(text).toContain('Severity went up from Significant (3/5) to Critical (5/5)');
    expect(html).toContain('Severity went up from Significant (3/5) to Critical (5/5)');
    expect(text).not.toContain('Location');
    expect(text).toContain('1 of your Alert Rules matched (destination "My email")');
  });
});
