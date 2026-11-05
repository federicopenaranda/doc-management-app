import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';
import { PubsubOidcGuard } from './pubsub-oidc.guard.js';

const SA = 'pubsub-push@project.iam.gserviceaccount.com';
const AUDIENCE = 'https://backend.example.com';

const config = {
  get: (key: string) =>
    ({ BACKEND_URL: AUDIENCE, PUBSUB_PUSH_SA_EMAIL: SA })[key],
} as unknown as ConfigService<Env, true>;

const contextWith = (authorization?: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ headers: { authorization } }),
    }),
  }) as unknown as ExecutionContext;

describe('PubsubOidcGuard', () => {
  it.each([undefined, '', 'Basic abc', 'Bearer'])(
    'rejects the header %j',
    async (header) => {
      const verify = vi.fn();
      const guard = new PubsubOidcGuard(config, verify);

      await expect(guard.canActivate(contextWith(header))).rejects.toThrow(
        UnauthorizedException,
      );
      expect(verify).not.toHaveBeenCalled();
    },
  );

  it('rejects a token the verifier refuses', async () => {
    const guard = new PubsubOidcGuard(
      config,
      vi.fn().mockRejectedValue(new Error('bad signature')),
    );

    await expect(guard.canActivate(contextWith('Bearer t'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it.each([
    [
      {
        email: 'someone-else@project.iam.gserviceaccount.com',
        email_verified: true,
      },
    ],
    [{ email: SA, email_verified: false }],
    [{ email: undefined, email_verified: true }],
  ])('rejects the claims %j', async (claims) => {
    const guard = new PubsubOidcGuard(
      config,
      vi.fn().mockResolvedValue(claims),
    );

    await expect(guard.canActivate(contextWith('Bearer t'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('accepts the verified pubsub-push identity and checks the audience', async () => {
    const verify = vi
      .fn()
      .mockResolvedValue({ email: SA, email_verified: true });
    const guard = new PubsubOidcGuard(config, verify);

    await expect(guard.canActivate(contextWith('Bearer t'))).resolves.toBe(
      true,
    );
    expect(verify).toHaveBeenCalledWith('t', AUDIENCE);
  });
});
