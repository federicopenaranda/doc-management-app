import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { parseBody } from '../common/validation.js';
import { AuthService, type LoginResult, type Profile } from './auth.service.js';
import { JwtAuthGuard, type AuthenticatedRequest } from './jwt-auth.guard.js';

const loginSchema = z.object({
  // Trimmed first: an email pasted from a mail client often carries a space.
  email: z.string().trim().pipe(z.email()),
  // The upper bound keeps a huge body from turning into a huge hashing job.
  password: z.string().min(1).max(200),
});

const refreshSchema = z.object({
  // A real token is 43 characters; the bound keeps a huge body out of the hash.
  refreshToken: z.string().min(1).max(200),
});

const languageSchema = z.object({ language: z.enum(['en', 'es']) });

@ApiExcludeController()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Five attempts per minute per IP, on top of the global limit: this route is the one to guess against. */
  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async login(@Body() body: unknown): Promise<LoginResult> {
    const { email, password } = parseBody(loginSchema, body);
    return this.auth.login(email, password);
  }

  /** A random 256-bit token cannot be guessed, but the limit still stops a flood of lookups. */
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(@Body() body: unknown): Promise<LoginResult> {
    return this.auth.refresh(parseBody(refreshSchema, body).refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async logout(@Body() body: unknown): Promise<void> {
    await this.auth.logout(parseBody(refreshSchema, body).refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: AuthenticatedRequest): Promise<Profile> {
    return this.auth.profile(request.user.id);
  }

  @Put('me/language')
  @UseGuards(JwtAuthGuard)
  setLanguage(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<Profile> {
    return this.auth.setLanguage(
      request.user.id,
      parseBody(languageSchema, body).language,
    );
  }
}
