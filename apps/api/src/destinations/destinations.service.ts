import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ChannelDestinationBase,
  ChannelDestinationInput,
  TestDeliveryResult,
} from '@sonrisa/shared';
import { DeliveryError } from '../channels/channel-provider.js';
import { ChannelRegistry } from '../channels/channel-registry.js';
import { isPrismaError } from '../common/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';

const destinationFields = {
  id: true,
  userId: true,
  channel: true,
  label: true,
  config: true,
} as const;

/**
 * Every query is scoped by `userId` in the same statement as the id, so another user's
 * destination is indistinguishable from a missing one (404, never 403: no existence leak).
 */
@Injectable()
export class DestinationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly channels: ChannelRegistry,
  ) {}

  list(userId: string): Promise<ChannelDestinationBase[]> {
    return this.prisma.channelDestination.findMany({
      where: { userId },
      select: destinationFields,
      orderBy: { createdAt: 'asc' },
    });
  }

  async get(userId: string, id: string): Promise<ChannelDestinationBase> {
    const found = await this.prisma.channelDestination.findFirst({
      where: { id, userId },
      select: destinationFields,
    });
    if (!found) throw new NotFoundException();
    return found;
  }

  create(userId: string, input: ChannelDestinationInput): Promise<ChannelDestinationBase> {
    const config = this.channels.parseConfig(input.channel, input.config);
    return this.prisma.channelDestination.create({
      data: { userId, channel: input.channel, label: input.label, config },
      select: destinationFields,
    });
  }

  async update(
    userId: string,
    id: string,
    input: ChannelDestinationInput,
  ): Promise<ChannelDestinationBase> {
    const config = this.channels.parseConfig(input.channel, input.config);
    try {
      return await this.prisma.channelDestination.update({
        where: { id, userId },
        data: { channel: input.channel, label: input.label, config },
        select: destinationFields,
      });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) throw new NotFoundException();
      throw error;
    }
  }

  /**
   * Refused (409) while a rule uses it: a rule must keep at least one destination. The database
   * enforces this (RESTRICT on AlertRuleDestination), so a rule saved concurrently can't slip
   * past a check-then-delete (review CR21).
   */
  async remove(userId: string, id: string): Promise<void> {
    try {
      await this.prisma.channelDestination.delete({ where: { id, userId } });
    } catch (error) {
      if (isPrismaError(error, 'P2025')) throw new NotFoundException();
      if (isPrismaError(error, 'P2003')) {
        const links = await this.prisma.alertRuleDestination.findMany({
          where: { destinationId: id },
          select: { ruleId: true },
        });
        throw new ConflictException({
          message: 'Destination is used by Alert Rules; remove it from them first',
          ruleIds: links.map((link) => link.ruleId),
        });
      }
      throw error;
    }
  }

  /**
   * Sends a test message right away (not through the queue) so the user sees the result at once.
   * A Channel's refusal is a normal outcome here, reported in the body, not an HTTP error.
   */
  async sendTest(userId: string, id: string): Promise<TestDeliveryResult> {
    const destination = await this.get(userId, id);
    try {
      await this.channels.send(
        destination.channel,
        destination.config,
        { type: 'test', destinationLabel: destination.label },
        AbortSignal.timeout(20_000),
      );
      return { delivered: true };
    } catch (error) {
      if (error instanceof DeliveryError) return { delivered: false, error: error.message };
      throw error;
    }
  }
}
