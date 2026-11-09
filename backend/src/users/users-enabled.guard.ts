import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';

/** A disabled feature does not exist as far as clients can tell: 404 before anything else, even without a token. */
@Injectable()
export class UsersEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(): boolean {
    if (!this.config.get('USERS_ENABLED', { infer: true })) {
      throw new NotFoundException();
    }
    return true;
  }
}
