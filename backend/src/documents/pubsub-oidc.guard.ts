import {
  Injectable,
  Optional,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { Env } from '../config/env.validation.js';

type Claims = { email?: string; email_verified?: boolean };
type Verify = (token: string, audience: string) => Promise<Claims>;

const googleClient = new OAuth2Client();
const verifyWithGoogle: Verify = async (token, audience) => {
  const ticket = await googleClient.verifyIdToken({ idToken: token, audience });
  return ticket.getPayload() ?? {};
};

/** Lets through only requests carrying a Google ID token signed for this backend by the pubsub-push identity. */
@Injectable()
export class PubsubOidcGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService<Env, true>,
    @Optional() private readonly verify: Verify = verifyWithGoogle,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string } }>();
    const token = /^Bearer (.+)$/.exec(
      request.headers.authorization ?? '',
    )?.[1];
    const audience = this.config.get('BACKEND_URL', { infer: true });
    const expectedEmail = this.config.get('PUBSUB_PUSH_SA_EMAIL', {
      infer: true,
    });
    if (!token || !audience || !expectedEmail)
      throw new UnauthorizedException();

    let claims: Claims;
    try {
      claims = await this.verify(token, audience);
    } catch {
      throw new UnauthorizedException();
    }
    if (!claims.email_verified || claims.email !== expectedEmail) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
