import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthResponse, LoginInput, RegisterInput, User } from '@sonrisa/shared';
import { isPrismaError } from '../common/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword, verifyPassword } from './password.js';

const publicUser = { id: true, email: true, role: true } as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Self-registration always creates a `user`; admins only come from the seed (D9). */
  async register(input: RegisterInput): Promise<AuthResponse> {
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.prisma.user.create({
        data: { email: input.email, passwordHash },
        select: publicUser,
      });
      return await this.issueToken(user);
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw new ConflictException('Email is already registered');
      throw error;
    }
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const found = await this.prisma.user.findUnique({ where: { email: input.email } });
    // Unknown email and wrong password get the same 401. The response time still differs (no argon2
    // run for an unknown email); accepted, because register's 409 reveals the same fact (D19(g)).
    if (!found || !(await verifyPassword(found.passwordHash, input.password)))
      throw new UnauthorizedException('Invalid email or password');
    return this.issueToken({ id: found.id, email: found.email, role: found.role });
  }

  private async issueToken(user: User): Promise<AuthResponse> {
    return { accessToken: await this.jwt.signAsync({ sub: user.id }), user };
  }
}
