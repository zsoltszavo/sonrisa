import { Controller, Get } from '@nestjs/common';
import type { MyNotification, User } from '@sonrisa/shared';
import { CurrentUser } from '../auth/decorators.js';
import { FeedService } from '../feed/feed.service.js';

@Controller('me')
export class MeController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  me(@CurrentUser() user: User): User {
    return user;
  }

  @Get('notifications')
  notifications(@CurrentUser() user: User): Promise<MyNotification[]> {
    return this.feed.myNotifications(user.id);
  }
}
