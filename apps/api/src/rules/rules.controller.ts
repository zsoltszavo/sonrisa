import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import {
  type AlertRule,
  type AlertRuleInput,
  alertRuleInputSchema,
  type User,
} from '@sonrisa/shared';
import { CurrentUser } from '../auth/decorators.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { RulesService } from './rules.service.js';

const inputPipe = new ZodValidationPipe(alertRuleInputSchema);

@Controller('rules')
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<AlertRule[]> {
    return this.rules.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id') id: string): Promise<AlertRule> {
    return this.rules.get(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: User, @Body(inputPipe) input: AlertRuleInput): Promise<AlertRule> {
    return this.rules.create(user.id, input);
  }

  @Put(':id')
  update(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body(inputPipe) input: AlertRuleInput,
  ): Promise<AlertRule> {
    return this.rules.update(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: User, @Param('id') id: string): Promise<void> {
    return this.rules.remove(user.id, id);
  }
}
