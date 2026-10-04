import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  type ChannelDestinationBase,
  type ChannelDestinationInput,
  channelDestinationInputSchema,
  type TestDeliveryResult,
  type User,
} from '@sonrisa/shared';
import { CurrentUser } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DestinationsService } from './destinations.service.js';

const inputPipe = new ZodValidationPipe(channelDestinationInputSchema);

@Controller('destinations')
export class DestinationsController {
  constructor(private readonly destinations: DestinationsService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<ChannelDestinationBase[]> {
    return this.destinations.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string): Promise<ChannelDestinationBase> {
    return this.destinations.get(user.id, id);
  }

  @Post()
  create(
    @CurrentUser() user: User,
    @Body(inputPipe) input: ChannelDestinationInput,
  ): Promise<ChannelDestinationBase> {
    return this.destinations.create(user.id, input);
  }

  @Put(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(inputPipe) input: ChannelDestinationInput,
  ): Promise<ChannelDestinationBase> {
    return this.destinations.update(user.id, id, input);
  }

  @Post(':id/test')
  @HttpCode(200)
  sendTest(@CurrentUser() user: User, @Param('id') id: string): Promise<TestDeliveryResult> {
    return this.destinations.sendTest(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: User, @Param('id') id: string): Promise<void> {
    return this.destinations.remove(user.id, id);
  }
}
