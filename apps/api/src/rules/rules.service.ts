import { Injectable, NotFoundException } from '@nestjs/common';
import { type AlertRule, type AlertRuleInput, severitySchema } from '@sonrisa/shared';
import { isPrismaError } from '../common/prisma-errors.js';
import { validationError } from '../common/validation-error.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ruleFields = {
  id: true,
  userId: true,
  category: true,
  minSeverity: true,
  keywords: true,
  destinations: { select: { destinationId: true }, orderBy: { createdAt: 'asc' } },
} as const satisfies Prisma.AlertRuleSelect;

type RuleRow = Prisma.AlertRuleGetPayload<{ select: typeof ruleFields }>;

function toAlertRule(row: RuleRow): AlertRule {
  return {
    id: row.id,
    userId: row.userId,
    category: row.category,
    // The column is a plain Int; reading it through the schema keeps the 1–5 type honest.
    minSeverity: severitySchema.parse(row.minSeverity),
    keywords: row.keywords,
    destinationIds: row.destinations.map((link) => link.destinationId),
  };
}

/** Same rules as DestinationsService: every query is scoped by `userId`; foreign ids are 404. */
@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<AlertRule[]> {
    const rows = await this.prisma.alertRule.findMany({
      where: { userId },
      select: ruleFields,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toAlertRule);
  }

  async get(userId: string, id: string): Promise<AlertRule> {
    const row = await this.prisma.alertRule.findFirst({
      where: { id, userId },
      select: ruleFields,
    });
    if (!row) throw new NotFoundException();
    return toAlertRule(row);
  }

  async create(userId: string, input: AlertRuleInput): Promise<AlertRule> {
    const row = await this.withDestinationRace(async (tx) => {
      await assertOwnsDestinations(tx, userId, input.destinationIds);
      return tx.alertRule.create({
        data: {
          userId,
          category: input.category,
          minSeverity: input.minSeverity,
          keywords: input.keywords,
          destinations: { create: links(input.destinationIds) },
        },
        select: ruleFields,
      });
    });
    return toAlertRule(row);
  }

  async update(userId: string, id: string, input: AlertRuleInput): Promise<AlertRule> {
    const row = await this.withDestinationRace(async (tx) => {
      const owned = await tx.alertRule.findFirst({ where: { id, userId }, select: { id: true } });
      if (!owned) throw new NotFoundException();
      await assertOwnsDestinations(tx, userId, input.destinationIds);
      return tx.alertRule.update({
        where: { id, userId },
        data: {
          category: input.category,
          minSeverity: input.minSeverity,
          keywords: input.keywords,
          destinations: { deleteMany: {}, create: links(input.destinationIds) },
        },
        select: ruleFields,
      });
    });
    return toAlertRule(row);
  }

  /**
   * Runs a rule write in a transaction. If a destination is deleted between the ownership check
   * and the insert, the foreign key fails (P2003): that is the same "Unknown destination" 400.
   */
  private async withDestinationRace<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(work);
    } catch (error) {
      if (isPrismaError(error, 'P2003')) throw unknownDestination();
      throw error;
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    try {
      await this.prisma.alertRule.delete({ where: { id, userId } });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) throw new NotFoundException();
      throw error;
    }
  }
}

/**
 * CR15: a rule may only notify the owner's own destinations. Someone else's id gets the same
 * answer as a made-up one, so this can't be used to probe which destination ids exist.
 */
async function assertOwnsDestinations(
  tx: Prisma.TransactionClient,
  userId: string,
  destinationIds: readonly string[],
): Promise<void> {
  const owned = await tx.channelDestination.count({
    where: { id: { in: [...destinationIds] }, userId },
  });
  if (owned !== destinationIds.length) {
    throw unknownDestination();
  }
}

function unknownDestination() {
  return validationError([{ path: ['destinationIds'], message: 'Unknown destination' }]);
}

function links(destinationIds: readonly string[]) {
  return destinationIds.map((destinationId) => ({ destinationId }));
}
