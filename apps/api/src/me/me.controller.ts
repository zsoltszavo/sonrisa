import { Controller, Get } from '@nestjs/common';
import type { User } from '@sonrisa/shared';
import { CurrentUser } from '../auth/decorators.js';

@Controller('me')
export class MeController {
  @Get()
  me(@CurrentUser() user: User): User {
    return user;
  }
}
