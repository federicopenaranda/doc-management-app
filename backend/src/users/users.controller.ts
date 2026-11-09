import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { UserSummary } from '../auth/users.repository.js';
import { UsersEnabledGuard } from './users-enabled.guard.js';
import { UsersService } from './users.service.js';

const name = z.string().trim().min(1).max(100);

const createUserSchema = z.object({
  firstName: name,
  lastName: name,
  // Trimmed first: an email pasted from a mail client often carries a space.
  email: z.string().trim().pipe(z.email()),
  // The bounds match the users:create script; the upper one keeps a huge body from turning into a huge hashing job.
  password: z.string().min(12).max(200),
});

/**
 * Any logged-in user can list and create users until roles exist (SCRUM-17).
 * Remove UsersEnabledGuard with the flag, two weeks after it is in use.
 */
@ApiExcludeController()
@Controller('users')
@UseGuards(UsersEnabledGuard, JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<UserSummary[]> {
    return this.users.list();
  }

  /** Hashing a password is slow on purpose, so creation has its own tighter limit. */
  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@Body() body: unknown): Promise<UserSummary> {
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(
        parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      );
    }
    return this.users.create(parsed.data);
  }
}
