import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  type AuthResponse,
  type LoginInput,
  loginInputSchema,
  type RegisterInput,
  registerInputSchema,
} from '@sonrisa/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { Public } from './decorators.js';

@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(
    @Body(new ZodValidationPipe(registerInputSchema)) input: RegisterInput,
  ): Promise<AuthResponse> {
    return this.auth.register(input);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(loginInputSchema)) input: LoginInput): Promise<AuthResponse> {
    return this.auth.login(input);
  }
}
