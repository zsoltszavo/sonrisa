import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

// Only the one method the controller uses; the real database path is covered by test/health.e2e-spec.ts.
function controllerWithDatabase(queryRaw: () => Promise<unknown>): HealthController {
  const prisma = { $queryRaw: queryRaw } as unknown as PrismaService;
  return new HealthController(prisma);
}

describe('HealthController', () => {
  it('reports ok when the database answers', async () => {
    const controller = controllerWithDatabase(() => Promise.resolve([{ '?column?': 1 }]));
    await expect(controller.check()).resolves.toEqual({ status: 'ok', database: 'up' });
  });

  it('responds 503 with database "down" when the query fails', async () => {
    const controller = controllerWithDatabase(() => Promise.reject(new Error('ECONNREFUSED')));
    const failure = controller.check();
    await expect(failure).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(failure).rejects.toMatchObject({
      response: { status: 'error', database: 'down' },
    });
  });
});
