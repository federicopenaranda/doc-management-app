import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from '../auth/jwt-auth.guard.js';
import type { UserSummary } from '../auth/users.repository.js';
import { UsersEnabledGuard } from './users-enabled.guard.js';
import { UsersService } from './users.service.js';

const name = z.string().trim().min(1).max(100);

// Trimmed first: an email pasted from a mail client often carries a space.
const email = z.string().trim().pipe(z.email());

/** What the edit form sends. The password is not edited here: unknown keys are dropped. */
const editUserSchema = z.object({ firstName: name, lastName: name, email });

const createUserSchema = editUserSchema.extend({
  // The bounds match the users:create script; the upper one keeps a huge body from turning into a huge hashing job.
  password: z.string().min(12).max(200),
});

const activeSchema = z.object({ isActive: z.boolean() });

const idSchema = z.uuid();

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(
      parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
    );
  }
  return parsed.data;
}

/** Something that is not an id cannot be a user: 404, not a database error. */
function userId(id: string): string {
  if (!idSchema.safeParse(id).success) {
    throw new NotFoundException('User not found');
  }
  return id;
}

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

  @Get(':id')
  get(@Param('id') id: string): Promise<UserSummary> {
    return this.users.get(userId(id));
  }

  /** Hashing a password is slow on purpose, so creation has its own tighter limit. */
  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@Body() body: unknown): Promise<UserSummary> {
    return this.users.create(parse(createUserSchema, body));
  }

  /** Turns a user on or off. Nobody can disable themselves; turning a user off ends their sessions at once. */
  @Put(':id/active')
  setActive(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<UserSummary> {
    return this.users.setActive(
      request.user.id,
      userId(id),
      parse(activeSchema, body).isActive,
    );
  }

  /** Users are archived, never deleted: they leave the list and cannot sign in, and their history stays. */
  @Post(':id/archive')
  @HttpCode(204)
  archive(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    return this.users.archive(request.user.id, userId(id));
  }

  /** The email and the names. Changing a password is a separate feature. */
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown): Promise<UserSummary> {
    return this.users.update(userId(id), parse(editUserSchema, body));
  }
}
