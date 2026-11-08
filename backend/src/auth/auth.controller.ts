import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import type { Env } from '../config/env.validation.js';
import { AuthService, type LoginResult } from './auth.service.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
  type AuthenticatedUser,
} from './jwt-auth.guard.js';

const loginSchema = z.object({
  email: z.email(),
  // The upper bound keeps a huge body from turning into a huge hashing job.
  password: z.string().min(1).max(200),
});

@ApiExcludeController()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly auth: AuthService,
  ) {}

  /** Five attempts per minute per IP, on top of the global limit: this route is the one to guess against. */
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() body: unknown): Promise<LoginResult> {
    // A disabled feature does not exist as far as clients can tell.
    if (!this.config.get('AUTH_ENABLED', { infer: true })) {
      throw new NotFoundException();
    }
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      );
    }
    return this.auth.login(parsed.data.email, parsed.data.password);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: AuthenticatedRequest): AuthenticatedUser {
    return request.user;
  }
}
