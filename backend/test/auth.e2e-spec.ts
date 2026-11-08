import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

const SECRET = 'test-secret-test-secret-test-secret-1234'; // same as vitest.config.e2e.ts
const PASSWORD = 'correct horse battery';
const USER_ID = '6f1e0f0e-5d3c-4b7a-9d52-0a1f3c2b7e11';

// ConfigModule.forRoot() validates the environment when AppModule is first imported,
// so each case re-imports the app after setting the flags.
async function createApp(authEnabled: boolean) {
  process.env.AUTH_ENABLED = String(authEnabled);
  process.env.DATABASE_ENABLED = String(authEnabled);
  vi.resetModules();
  const { AppModule } = await import('./../src/app.module.js');
  const { setupApp } = await import('./../src/app.setup.js');
  const { DatabaseService } =
    await import('./../src/database/database.service.js');
  const { hashPassword } = await import('./../src/auth/password.js');

  const passwordHash = await hashPassword(PASSWORD, { N: 1024, r: 8, p: 1 });
  const users: Record<string, { is_active: boolean }> = {
    'ana@example.com': { is_active: true },
    'off@example.com': { is_active: false },
  };
  const query = (_sql: string, params: string[]) => {
    const found = users[params[0].toLowerCase()];
    return Promise.resolve({
      rows: found
        ? [
            {
              id: USER_ID,
              email: params[0].toLowerCase(),
              password_hash: passwordHash,
              is_active: found.is_active,
            },
          ]
        : [],
    });
  };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue(authEnabled ? { pool: { query } } : null)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app);
  await app.init();
  return app;
}

const login = (app: NestExpressApplication, email: string, password: string) =>
  request(app.getHttpServer()).post('/auth/login').send({ email, password });

describe('auth (e2e)', () => {
  afterEach(() => {
    delete process.env.AUTH_ENABLED;
    delete process.env.DATABASE_ENABLED;
  });

  describe('while the feature flag is off', () => {
    it('has no login and no /auth/me', async () => {
      const app = await createApp(false);

      await login(app, 'ana@example.com', PASSWORD).expect(404);
      await request(app.getHttpServer()).get('/auth/me').expect(404);
      await app.close();
    });
  });

  describe('POST /auth/login', () => {
    it('returns an access token for the right credentials, ignoring email case', async () => {
      const app = await createApp(true);

      const response = await login(app, 'Ana@Example.com', PASSWORD).expect(
        200,
      );

      expect(response.body).toEqual({
        accessToken: expect.any(String),
        expiresIn: 3600,
      });
      expect(JSON.stringify(response.body)).not.toContain('scrypt');
      await app.close();
    });

    it.each([
      ['a wrong password', 'ana@example.com', 'wrong password!!'],
      ['an unknown email', 'nobody@example.com', PASSWORD],
      ['an inactive user', 'off@example.com', PASSWORD],
    ])(
      'answers 401 with the same message for %s',
      async (_label, email, password) => {
        const app = await createApp(true);

        const response = await login(app, email, password).expect(401);

        expect(response.body.message).toEqual(['Invalid email or password']);
        await app.close();
      },
    );

    it.each([
      ['no body', {}],
      ['a bad email', { email: 'not-an-email', password: PASSWORD }],
      ['an empty password', { email: 'ana@example.com', password: '' }],
      ['a non-string password', { email: 'ana@example.com', password: 12345 }],
    ])('answers 400 for %s', async (_label, body) => {
      const app = await createApp(true);

      await request(app.getHttpServer())
        .post('/auth/login')
        .send(body)
        .expect(400);
      await app.close();
    });

    it('limits login attempts: the sixth within a minute is refused', async () => {
      const app = await createApp(true);

      for (let i = 0; i < 5; i++) {
        await login(app, 'ana@example.com', 'wrong password!!').expect(401);
      }
      await login(app, 'ana@example.com', PASSWORD).expect(429);
      await app.close();
    });
  });

  describe('GET /auth/me', () => {
    const me = (app: NestExpressApplication, token?: string) => {
      const req = request(app.getHttpServer()).get('/auth/me');
      return token === undefined
        ? req
        : req.set('Authorization', `Bearer ${token}`);
    };

    it('returns who the token belongs to', async () => {
      const app = await createApp(true);
      const { body } = await login(app, 'ana@example.com', PASSWORD).expect(
        200,
      );

      const response = await me(app, body.accessToken).expect(200);

      expect(response.body).toEqual({ id: USER_ID, email: 'ana@example.com' });
      await app.close();
    });

    it('answers 401 without a token', async () => {
      const app = await createApp(true);

      await me(app).expect(401);
      await app.close();
    });

    it('answers 401 for a token that is not a Bearer token', async () => {
      const app = await createApp(true);
      const { body } = await login(app, 'ana@example.com', PASSWORD).expect(
        200,
      );

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Basic ${body.accessToken}`)
        .expect(401);
      await app.close();
    });

    it('answers 401 for a tampered token', async () => {
      const app = await createApp(true);
      const { body } = await login(app, 'ana@example.com', PASSWORD).expect(
        200,
      );
      const [header, payload] = body.accessToken.split('.');
      const forged = Buffer.from(
        JSON.stringify({
          sub: 'someone-else',
          email: 'admin@example.com',
          exp: 9999999999,
        }),
      ).toString('base64url');

      await me(
        app,
        `${header}.${forged}.${body.accessToken.split('.')[2]}`,
      ).expect(401);
      expect(payload).not.toBe(forged);
      await app.close();
    });

    it('answers 401 for a token signed with another secret', async () => {
      const app = await createApp(true);
      const other = new JwtService({
        secret: 'another-secret-another-secret-12345',
      });

      await me(
        app,
        await other.signAsync({ sub: USER_ID, email: 'ana@example.com' }),
      ).expect(401);
      await app.close();
    });

    it('answers 401 for an expired token', async () => {
      const app = await createApp(true);
      const jwt = new JwtService({ secret: SECRET });

      await me(
        app,
        await jwt.signAsync(
          { sub: USER_ID, email: 'ana@example.com' },
          { expiresIn: -10 },
        ),
      ).expect(401);
      await app.close();
    });

    it('answers 401 for an unsigned token (alg none)', async () => {
      const app = await createApp(true);
      const part = (value: object) =>
        Buffer.from(JSON.stringify(value)).toString('base64url');

      await me(
        app,
        `${part({ alg: 'none', typ: 'JWT' })}.${part({ sub: USER_ID, email: 'ana@example.com' })}.`,
      ).expect(401);
      await app.close();
    });
  });
});
