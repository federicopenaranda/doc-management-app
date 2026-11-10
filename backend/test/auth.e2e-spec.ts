import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

const SECRET = 'test-secret-test-secret-test-secret-1234'; // same as vitest.config.e2e.ts
const PASSWORD = 'correct horse battery';
const USER_ID = '6f1e0f0e-5d3c-4b7a-9d52-0a1f3c2b7e11';

// ConfigModule.forRoot() validates the environment when AppModule is first imported,
// so each case re-imports the app after setting the flags.
async function createApp(authEnabled: boolean, refreshEnabled = false) {
  process.env.AUTH_ENABLED = String(authEnabled);
  process.env.DATABASE_ENABLED = String(authEnabled);
  process.env.REFRESH_ENABLED = String(refreshEnabled);
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
  // A tiny in-memory refresh_tokens table, answering the exact statements the repository sends.
  const tokens = new Map<
    string,
    { user_id: string; used_at: Date | null; expires_at: Date }
  >();
  const refreshQuery = (sql: string, params: unknown[]) => {
    const row = tokens.get(params[0] as string);
    if (sql.startsWith('INSERT INTO refresh_tokens')) {
      tokens.set(params[1] as string, {
        user_id: params[0] as string,
        used_at: null,
        expires_at: params[2] as Date,
      });
      return { rows: [] };
    }
    if (
      sql.startsWith(
        'UPDATE refresh_tokens SET used_at = now() WHERE token_hash',
      )
    ) {
      if (!row || row.used_at || row.expires_at <= new Date())
        return { rows: [] };
      row.used_at = new Date();
      return { rows: [{ user_id: row.user_id }] };
    }
    if (sql.startsWith('SELECT user_id, used_at FROM refresh_tokens')) {
      return {
        rows: row ? [{ user_id: row.user_id, used_at: row.used_at }] : [],
      };
    }
    if (sql.startsWith('UPDATE refresh_tokens SET used_at = coalesce')) {
      if (row) row.used_at ??= new Date();
      return { rows: [] };
    }
    for (const token of tokens.values()) {
      if (token.user_id === params[0]) token.used_at ??= new Date();
    }
    return { rows: [] };
  };
  let language = 'en';
  const query = (sql: string, params: string[]) => {
    if (sql.startsWith('SELECT language FROM users')) {
      return Promise.resolve({ rows: [{ language }] });
    }
    if (sql.startsWith('UPDATE users SET language')) {
      language = params[1];
      return Promise.resolve({ rows: [{ id: USER_ID }] });
    }
    if (sql.includes('refresh_tokens')) {
      return Promise.resolve(refreshQuery(sql, params));
    }
    const byId = sql.includes('WHERE id = $1');
    const email = byId
      ? params[0] === USER_ID
        ? 'ana@example.com'
        : ''
      : params[0].toLowerCase();
    const found = users[email];
    return Promise.resolve({
      rows: found
        ? [
            {
              id: USER_ID,
              email,
              password_hash: passwordHash,
              first_name: 'Ana',
              last_name: 'García',
              is_active: found.is_active,
              created_at: new Date('2026-11-09T12:00:00Z'),
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
    delete process.env.REFRESH_ENABLED;
  });

  describe('refresh tokens', () => {
    const post = (app: NestExpressApplication, path: string, body: object) =>
      request(app.getHttpServer()).post(path).send(body);

    it('are off by default: no refresh token at login, and no /auth/refresh or /auth/logout', async () => {
      const app = await createApp(true);

      const { body } = await login(app, 'ana@example.com', PASSWORD).expect(
        200,
      );
      expect(body.refreshToken).toBeUndefined();
      await post(app, '/auth/refresh', { refreshToken: 'x' }).expect(404);
      await post(app, '/auth/logout', { refreshToken: 'x' }).expect(404);
      await app.close();
    });

    it('log in with a refresh token, which swaps once for a new pair', async () => {
      const app = await createApp(true, true);
      const first = (await login(app, 'ana@example.com', PASSWORD).expect(200))
        .body;
      expect(first.refreshToken).toEqual(expect.any(String));

      const second = (
        await post(app, '/auth/refresh', {
          refreshToken: first.refreshToken,
        }).expect(200)
      ).body;

      expect(second).toEqual({
        accessToken: expect.any(String),
        expiresIn: 3600,
        refreshToken: expect.any(String),
      });
      expect(second.refreshToken).not.toBe(first.refreshToken);
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${second.accessToken}`)
        .expect(200);
      await app.close();
    });

    it('answers 401 when an old token is used again, and that also kills the new one', async () => {
      const app = await createApp(true, true);
      const first = (await login(app, 'ana@example.com', PASSWORD).expect(200))
        .body;
      const second = (
        await post(app, '/auth/refresh', {
          refreshToken: first.refreshToken,
        }).expect(200)
      ).body;

      await post(app, '/auth/refresh', {
        refreshToken: first.refreshToken,
      }).expect(401);
      await post(app, '/auth/refresh', {
        refreshToken: second.refreshToken,
      }).expect(401);
      await app.close();
    });

    it('answers 401 for a token the server never issued', async () => {
      const app = await createApp(true, true);

      await post(app, '/auth/refresh', { refreshToken: 'made-up' }).expect(401);
      await app.close();
    });

    it('answers 400 without a refresh token', async () => {
      const app = await createApp(true, true);

      await post(app, '/auth/refresh', {}).expect(400);
      await post(app, '/auth/logout', { refreshToken: 5 }).expect(400);
      await app.close();
    });

    it('stop working after logout', async () => {
      const app = await createApp(true, true);
      const { body } = await login(app, 'ana@example.com', PASSWORD).expect(
        200,
      );

      await post(app, '/auth/logout', {
        refreshToken: body.refreshToken,
      }).expect(204);

      await post(app, '/auth/refresh', {
        refreshToken: body.refreshToken,
      }).expect(401);
      await app.close();
    });
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

    it('accepts an email pasted with surrounding spaces', async () => {
      const app = await createApp(true);

      await login(app, '  ana@example.com  ', PASSWORD).expect(200);
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

  describe('PUT /auth/me/language', () => {
    it('saves the language and /auth/me then shows it', async () => {
      const app = await createApp(true);
      const { body } = await login(app, 'ana@example.com', PASSWORD).expect(
        200,
      );
      const auth = { Authorization: `Bearer ${body.accessToken}` };

      await request(app.getHttpServer())
        .put('/auth/me/language')
        .set(auth)
        .send({ language: 'es' })
        .expect(200);

      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set(auth)
        .expect(200);
      expect(me.body.language).toBe('es');
      await app.close();
    });

    it('answers 400 for a language that is not offered', async () => {
      const app = await createApp(true);
      const { body } = await login(app, 'ana@example.com', PASSWORD).expect(
        200,
      );

      await request(app.getHttpServer())
        .put('/auth/me/language')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .send({ language: 'fr' })
        .expect(400);
      await app.close();
    });

    it('answers 401 without a token', async () => {
      const app = await createApp(true);

      await request(app.getHttpServer())
        .put('/auth/me/language')
        .send({ language: 'es' })
        .expect(401);
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

      expect(response.body).toEqual({
        id: USER_ID,
        email: 'ana@example.com',
        firstName: 'Ana',
        lastName: 'García',
        language: 'en',
      });
      await app.close();
    });

    it('answers 401 for a valid token whose user does not exist any more', async () => {
      const app = await createApp(true);
      const jwt = new JwtService({ secret: SECRET });

      await me(
        app,
        await jwt.signAsync({ sub: 'deleted-user', email: 'gone@example.com' }),
      ).expect(401);
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
