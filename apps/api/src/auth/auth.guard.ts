import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service.js';
import { IS_PUBLIC, type RequestWithUser } from './decorators.js';

const tokenPayloadSchema = z.object({ sub: z.string().min(1) });

/**
 * Global guard: every route needs a valid Bearer token unless marked @Public().
 * The User (and so the role) is loaded from the database on each request, so a role change
 * or a deleted account takes effect immediately instead of when the token expires.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    // RFC 7235: the scheme is case-insensitive (`bearer` is as valid as `Bearer`).
    const token = /^Bearer +(\S+)$/i.exec(request.headers.authorization ?? '')?.[1];
    if (!token) throw new UnauthorizedException();

    let payload: unknown;
    try {
      payload = await this.jwt.verifyAsync<object>(token);
    } catch {
      // Expired, malformed or wrongly signed: all the same 401 to the caller.
      throw new UnauthorizedException();
    }
    const claims = tokenPayloadSchema.safeParse(payload);
    if (!claims.success) throw new UnauthorizedException();

    const user = await this.prisma.user.findUnique({
      where: { id: claims.data.sub },
      select: { id: true, email: true, role: true },
    });
    if (!user) throw new UnauthorizedException();
    request.user = user;
    return true;
  }
}
