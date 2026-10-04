import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import type { HealthResponse } from '@sonrisa/shared';
import { Public } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /** 200 when Postgres answers a query, 503 otherwise. */
  @Get()
  async check(): Promise<HealthResponse> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error(
        'Database health check failed',
        error instanceof Error ? error.stack : error,
      );
      const body: HealthResponse = { status: 'error', database: 'down' };
      throw new ServiceUnavailableException(body);
    }
    return { status: 'ok', database: 'up' };
  }
}
