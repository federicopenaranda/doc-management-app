import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

const PASSWORD = 'a long enough password';
const newUser = {
  firstName: 'Ana',
  lastName: 'García',
  email: 'ana@example.com',
  password: PASSWORD,
};

// ConfigModule.forRoot() validates the environment when AppModule is first imported,
// so each case re-imports the app after setting the flags.
async function createApp(usersEnabled: boolean) {
  process.env.AUTH_ENABLED = 'true';
  process.env.DATABASE_ENABLED = 'true';
  process.env.USERS_ENABLED = String(usersEnabled);
  vi.resetModules();
  const { AppModule } = await import('./../src/app.module.js');
  const { setupApp } = await import('./../src/app.setup.js');
  const { DatabaseService } =
    await import('./../src/database/database.service.js');

  // A tiny in-memory users table, answering the exact statements the repository sends.
  const rows: Record<string, unknown>[] = [];
  const stored: unknown[][] = [];
  const query = (sql: string, params: string[] = []) => {
    if (sql.startsWith('INSERT INTO users')) {
      stored.push(params);
      const taken = rows.some(
        (row) =>
          (row.email as string).toLowerCase() === params[0].toLowerCase(),
      );
      if (taken) return Promise.resolve({ rows: [] });
      const row = {
        id: `id-${rows.length + 1}`,
        email: params[0],
        first_name: params[1],
        last_name: params[2],
        is_active: true,
        created_at: new Date('2026-11-09T12:00:00Z'),
      };
      rows.push(row);
      return Promise.resolve({ rows: [row] });
    }
    if (sql.startsWith('SELECT id, email, first_name')) {
      return Promise.resolve({ rows });
    }
    return Promise.resolve({ rows: [] });
  };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue({ pool: { query } })
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app);
  await app.init();
  const token = app
    .get(JwtService)
    .sign({ sub: 'someone', email: 'admin@example.com' });
  return { app, token, stored };
}

const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('users (e2e)', () => {
  afterEach(() => {
    delete process.env.AUTH_ENABLED;
    delete process.env.DATABASE_ENABLED;
    delete process.env.USERS_ENABLED;
  });

  describe('while the feature flag is off', () => {
    it('does not exist, even for a logged-in user or without a token', async () => {
      const { app, token } = await createApp(false);
      const server = app.getHttpServer();

      await request(server).get('/users').expect(404);
      await request(server).post('/users').send(newUser).expect(404);
      await request(server).get('/users').set(authed(token)).expect(404);
      await request(server)
        .post('/users')
        .set(authed(token))
        .send(newUser)
        .expect(404);
      await app.close();
    });
  });

  describe('without a login token', () => {
    it('answers 401 to the list and to creating a user', async () => {
      const { app } = await createApp(true);
      const server = app.getHttpServer();

      await request(server).get('/users').expect(401);
      await request(server).post('/users').send(newUser).expect(401);
      await request(server)
        .get('/users')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
      await app.close();
    });
  });

  describe('POST /users', () => {
    it('creates a user, answers 201 without the password or its hash, and the user shows in the list', async () => {
      const { app, token, stored } = await createApp(true);
      const server = app.getHttpServer();

      const response = await request(server)
        .post('/users')
        .set(authed(token))
        .send(newUser)
        .expect(201);

      expect(response.body).toEqual({
        id: 'id-1',
        email: 'ana@example.com',
        firstName: 'Ana',
        lastName: 'García',
        isActive: true,
        createdAt: '2026-11-09T12:00:00.000Z',
      });
      expect(JSON.stringify(response.body)).not.toMatch(/scrypt|password/i);
      expect(stored[0][3]).toMatch(/^scrypt\$/);
      expect(JSON.stringify(stored)).not.toContain(PASSWORD);

      const list = await request(server)
        .get('/users')
        .set(authed(token))
        .expect(200);
      expect(list.body).toEqual([response.body]);
      await app.close();
    });

    it('trims the names and the email', async () => {
      const { app, token, stored } = await createApp(true);

      await request(app.getHttpServer())
        .post('/users')
        .set(authed(token))
        .send({
          ...newUser,
          firstName: '  Ana ',
          lastName: ' García  ',
          email: '  ana@example.com ',
        })
        .expect(201);

      expect(stored[0].slice(0, 3)).toEqual([
        'ana@example.com',
        'Ana',
        'García',
      ]);
      await app.close();
    });

    it('answers 409 when the email exists, whatever its letter case', async () => {
      const { app, token } = await createApp(true);
      const server = app.getHttpServer();
      await request(server)
        .post('/users')
        .set(authed(token))
        .send(newUser)
        .expect(201);

      const response = await request(server)
        .post('/users')
        .set(authed(token))
        .send({ ...newUser, email: 'ANA@Example.com' })
        .expect(409);

      expect(response.body.message).toEqual([
        'A user with this email already exists',
      ]);
      await app.close();
    });

    it.each([
      ['no body', {}],
      ['no first name', { ...newUser, firstName: undefined }],
      ['a blank first name', { ...newUser, firstName: '   ' }],
      ['no last name', { ...newUser, lastName: undefined }],
      [
        'a first name over 100 characters',
        { ...newUser, firstName: 'x'.repeat(101) },
      ],
      ['a bad email', { ...newUser, email: 'not-an-email' }],
      ['a password of 11 characters', { ...newUser, password: 'x'.repeat(11) }],
      [
        'a password over 200 characters',
        { ...newUser, password: 'x'.repeat(201) },
      ],
      ['a non-string password', { ...newUser, password: 123456789012 }],
    ])('answers 400 for %s', async (_label, body) => {
      const { app, token } = await createApp(true);

      await request(app.getHttpServer())
        .post('/users')
        .set(authed(token))
        .send(body)
        .expect(400);
      await app.close();
    });

    it('limits creation: the eleventh within a minute is refused', async () => {
      const { app, token } = await createApp(true);
      const server = app.getHttpServer();

      for (let i = 0; i < 10; i++) {
        await request(server)
          .post('/users')
          .set(authed(token))
          .send({ ...newUser, email: `user${i}@example.com` })
          .expect(201);
      }
      await request(server)
        .post('/users')
        .set(authed(token))
        .send({ ...newUser, email: 'one-more@example.com' })
        .expect(429);
      await app.close();
    });
  });

  describe('GET /users', () => {
    it('returns an empty list when there are no users', async () => {
      const { app, token } = await createApp(true);

      const response = await request(app.getHttpServer())
        .get('/users')
        .set(authed(token))
        .expect(200);

      expect(response.body).toEqual([]);
      await app.close();
    });
  });
});
