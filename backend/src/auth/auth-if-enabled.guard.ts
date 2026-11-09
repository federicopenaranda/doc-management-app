import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

/**
 * For routes that existed before login: open while AUTH_ENABLED is off, token required once it is on.
 * (JwtAuthGuard alone answers 404 while the flag is off, which would break them.)
 * Remove with the flag, two weeks after login is in use: then use JwtAuthGuard directly.
 */
@Injectable()
export class AuthIfEnabledGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly jwtGuard: JwtAuthGuard,
  ) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    if (!this.config.get('AUTH_ENABLED', { infer: true })) return true;
    return this.jwtGuard.canActivate(context);
  }
}
