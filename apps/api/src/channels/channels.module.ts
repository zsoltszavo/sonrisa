import { Module } from '@nestjs/common';
import { ChannelRegistry } from './channel-registry.js';
import { ChannelsController } from './channels.controller.js';
import { EmailChannel } from './email.channel.js';
import { SlackChannel } from './slack.channel.js';

@Module({
  providers: [EmailChannel, SlackChannel, ChannelRegistry],
  controllers: [ChannelsController],
  exports: [ChannelRegistry],
})
export class ChannelsModule {}
