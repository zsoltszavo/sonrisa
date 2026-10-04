/** Ports of the stack the browser test starts (playwright.config.ts); clear of the dev ones. */
export const PORTS = { api: 3100, web: 5174, standin: 4014 } as const;
export const STANDIN_URL = `http://localhost:${String(PORTS.standin)}`;
/** Mailpit from docker compose (CI runs it as a service on the same port). */
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';
