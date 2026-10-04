import { readFileSync } from 'node:fs';
import path from 'node:path';

/** The real feed responses saved during planning (S0); adapter tests run against these. */
const SAMPLES_DIR = path.resolve(import.meta.dirname, '../../../../docs/evidence/feed-samples');

export const readFeedSample = (name: 'usgs' | 'gdacs'): string =>
  readFileSync(
    path.join(
      SAMPLES_DIR,
      name === 'usgs' ? 'usgs-all-hour-2026-10-04.geojson' : 'gdacs-rss-2026-10-04.xml',
    ),
    'utf8',
  );
