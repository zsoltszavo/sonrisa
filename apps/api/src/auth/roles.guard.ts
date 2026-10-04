import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@sonrisa/shared';
import { Roles, type RequestWithUser } from './decorators.js';

/** Runs after AuthGuard; a route with @Roles(...) is refused (403) to any other role. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Read by key: the decorator overload types this as Role[], but routes without @Roles give undefined.
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(Roles.KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles === undefined) return true;
    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user || !roles.includes(user.role)) throw new ForbiddenException();
    return true;
  }
}
