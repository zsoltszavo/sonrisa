import type { INestApplication } from '@nestjs/common';

/** App-wide HTTP settings, shared by main.ts and the e2e tests so they can't drift apart. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
}
