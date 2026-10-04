import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Everything under /admin is admin-only at the class level, so a new handler can't forget it.
 * S4 adds source updates, "poll now" and the Simulated Source here.
 */
@Roles(['admin'])
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('event-sources')
  eventSources() {
    return this.prisma.eventSource.findMany({ orderBy: { key: 'asc' } });
  }
}
