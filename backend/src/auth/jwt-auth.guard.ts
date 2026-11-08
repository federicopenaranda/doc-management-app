import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { Env } from '../config/env.validation.js';

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };

/** Lets a request through only with a valid "Authorization: Bearer <jwt>"; sets request.user. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // A disabled feature does not exist as far as clients can tell.
    if (!this.config.get('AUTH_ENABLED', { infer: true })) {
      throw new NotFoundException();
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();

    let payload: { sub?: unknown; email?: unknown };
    try {
      payload = await this.jwt.verifyAsync(token, { algorithms: ['HS256'] });
    } catch {
      throw new UnauthorizedException();
    }
    if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
      throw new UnauthorizedException();
    }
    request.user = { id: payload.sub, email: payload.email };
    return true;
  }
}
