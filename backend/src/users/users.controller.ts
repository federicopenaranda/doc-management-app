import {
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.model.js';
import {
  ROLE_KEYS,
  type ArchivedUser,
  type Role,
  type UserSummary,
} from '../auth/user.model.js';
import { parseBody } from '../common/validation.js';
import { UsersService } from './users.service.js';

const name = z.string().trim().min(1).max(100);

// Trimmed first: an email pasted from a mail client often carries a space.
const email = z.string().trim().pipe(z.email());

// At least one role, each a known one; a repeated role counts once.
const roles = z
  .array(z.enum(ROLE_KEYS))
  .min(1)
  .transform((keys) => [...new Set(keys)]);

/**
 * What the edit form sends. The password is not edited here: unknown keys are dropped. The client is checked by the
 * service, because it depends on the roles (a site admin has none).
 */
const editUserSchema = z.object({
  firstName: name,
  lastName: name,
  email,
  clientId: z
    .uuid()
    .nullish()
    .transform((id) => id ?? null),
  roles,
});

// The bounds match the users:create script; the upper one keeps a huge body from turning into a huge hashing job.
const password = z.string().min(12).max(200);

const createUserSchema = editUserSchema.extend({ password });

const passwordSchema = z.object({ password });

const activeSchema = z.object({ isActive: z.boolean() });

const idSchema = z.uuid();

/** Something that is not an id cannot be a user: 404, not a database error. */
function userId(id: string): string {
  if (!idSchema.safeParse(id).success) {
    throw new NotFoundException('User not found');
  }
  return id;
}

/**
 * Any logged-in user can list and create users until roles exist (SCRUM-17).
 */
@ApiExcludeController()
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<UserSummary[]> {
    return this.users.list();
  }

  // Declared before ':id', or "archived" would be read as an id.
  @Get('archived')
  listArchived(): Promise<ArchivedUser[]> {
    return this.users.listArchived();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<UserSummary> {
    return this.users.get(userId(id));
  }

  /** Hashing a password is slow on purpose, so creation has its own tighter limit. */
  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(
    @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ): Promise<UserSummary> {
    return this.users.create(
      request.user.id,
      parseBody(createUserSchema, body),
    );
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
      parseBody(activeSchema, body).isActive,
    );
  }

  /** Users are archived, never deleted: they leave the list and cannot sign in, and their history stays. */
  @Post(':id/archive')
  @HttpCode(200)
  archive(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<void> {
    return this.users.archive(request.user.id, userId(id));
  }

  /** An admin sets a new password. Hashing is slow on purpose, so it has the same tighter limit as creating. */
  @Put(':id/password')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  setPassword(@Param('id') id: string, @Body() body: unknown): Promise<void> {
    return this.users.setPassword(
      userId(id),
      parseBody(passwordSchema, body).password,
    );
  }

  /** Brings an archived user back, switched off. */
  @Post(':id/restore')
  @HttpCode(200)
  restore(@Param('id') id: string): Promise<void> {
    return this.users.restore(userId(id));
  }

  /** The email, the names, the client and the roles. Changing a password is a separate feature. */
  @Put(':id')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<UserSummary> {
    return this.users.update(
      request.user.id,
      userId(id),
      parseBody(editUserSchema, body),
    );
  }
}

/** The roles a user can be given, for the screens' role pickers. */
@ApiExcludeController()
@Controller('roles')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(): Promise<Role[]> {
    return this.users.listRoles();
  }
}
