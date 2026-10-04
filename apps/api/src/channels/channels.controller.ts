import { Controller, Get } from '@nestjs/common';
import type { ChannelInfo } from '@sonrisa/shared';
import { ChannelRegistry } from './channel-registry.js';

/** Signed-in users only (global auth guard): the destination forms are generated from this (S6). */
@Controller('channels')
export class ChannelsController {
  constructor(private readonly registry: ChannelRegistry) {}

  @Get()
  list(): ChannelInfo[] {
    return this.registry.list();
  }
}
