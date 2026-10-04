import { type Category, SEVERITY_LABELS, type Severity } from '@sonrisa/shared';

export const CATEGORY_LABELS: Record<Category, string> = {
  earthquake: 'Earthquakes',
  disaster: 'Disasters',
  news: 'News',
  market: 'Markets',
};

export const severityText = (severity: Severity) =>
  `${String(severity)} · ${SEVERITY_LABELS[severity]}`;

const dateTime = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export const formatDateTime = (date: Date) => dateTime.format(date);

/** "12 minutes ago" for the last day, then the date. */
export function formatAgo(date: Date, now = Date.now()): string {
  const minutes = Math.round((date.getTime() - now) / 60_000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  return formatDateTime(date);
}

/** Short, non-secret summary of a destination's config for lists (never the full webhook path). */
export function describeConfig(channel: string, config: unknown): string {
  if (typeof config !== 'object' || config === null) return '';
  if (channel === 'email' && 'to' in config && typeof config.to === 'string') return config.to;
  if ('webhookUrl' in config && typeof config.webhookUrl === 'string') {
    try {
      return new URL(config.webhookUrl).host;
    } catch {
      return 'Invalid URL';
    }
  }
  return '';
}

/** Tile colours for each Severity (the ramp in index.css); text colour keeps AA contrast on each. */
export const SEVERITY_TILE: Record<Severity, string> = {
  1: 'bg-sev-1 text-forest',
  2: 'bg-sev-2 text-forest',
  3: 'bg-sev-3 text-forest',
  4: 'bg-sev-4 text-forest',
  5: 'bg-sev-5 text-white',
};
