import {
  createParamDecorator,
  type ExecutionContext,
  InternalServerErrorException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role, User } from '@sonrisa/shared';
import type { Request } from 'express';

/** Routes are authenticated by default (global AuthGuard); this opts a route out. */
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Roles allowed on a controller or handler, checked by the global RolesGuard. */
export const Roles = Reflector.createDecorator<Role[]>();

/** What the AuthGuard attaches to the request: the User as currently stored, not as the token claims. */
export type RequestWithUser = Request & { user?: User };

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): User => {
  const { user } = ctx.switchToHttp().getRequest<RequestWithUser>();
  if (!user) {
    // Only reachable if a route is both @Public() and asks for the user: a programming error.
    throw new InternalServerErrorException('No authenticated user on this route');
  }
  return user;
});
