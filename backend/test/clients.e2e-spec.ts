import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

// The logged-in user: it exists for the "is this user still active?" check on every request.
const ADMIN_ID = '00000000-0000-4000-8000-0000000000aa';
const adminRow = {
  id: ADMIN_ID,
  email: 'admin@example.com',
  first_name: 'Admin',
  last_name: 'User',
  is_active: true,
  created_at: new Date('2026-11-08T12:00:00Z'),
};
const acme = {
  name: 'Acme',
  address: 'Calle 1',
  code: 'ACME',
  phone: '123',
  email: 'Info@Acme.com',
  prefix: 'ACM',
};

// ConfigModule.forRoot() validates the environment when AppModule is first imported,
// so each case re-imports the app after setting the flags.
async function createApp(clientsEnabled = true) {
  process.env.DATABASE_ENABLED = 'true';
  process.env.CLIENTS_ENABLED = String(clientsEnabled);
  vi.resetModules();
  const { AppModule } = await import('./../src/app.module.js');
  const { setupApp } = await import('./../src/app.setup.js');
  const { DatabaseService } =
    await import('./../src/database/database.service.js');

  // A tiny in-memory clients table, answering the exact statements the repository sends.
  const rows: Record<string, unknown>[] = [];
  // The three unique indexes, all ignoring letter case; a null code is never a duplicate.
  const taken = (
    values: { code: unknown; email: unknown; prefix: unknown },
    except?: unknown,
  ) => {
    for (const field of ['code', 'email', 'prefix'] as const) {
      const value = values[field];
      const clash = rows.some(
        (r) =>
          r !== except &&
          typeof r[field] === 'string' &&
          typeof value === 'string' &&
          r[field].toLowerCase() === value.toLowerCase(),
      );
      if (clash) {
        return Promise.reject(
          Object.assign(new Error('duplicate key'), {
            code: '23505',
            constraint: `clients_${field}_lower_key`,
          }),
        );
      }
    }
    return null;
  };
  const query = (sql: string, params: unknown[] = []) => {
    if (sql.startsWith('INSERT INTO clients')) {
      const [name, address, code, phone, email, prefix] = params;
      const clash = taken({ code, email, prefix });
      if (clash) return clash;
      const row = {
        id: `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, '0')}`,
        name,
        address,
        code,
        phone,
        email,
        prefix,
        created_at: new Date('2026-11-13T12:00:00Z'),
        updated_at: new Date('2026-11-13T12:00:00Z'),
        disabled_at: null,
      };
      rows.push(row);
      return Promise.resolve({ rows: [row] });
    }
    if (sql.startsWith('UPDATE clients SET name')) {
      const row = rows.find((r) => r.id === params[0]);
      if (!row) return Promise.resolve({ rows: [] });
      const [, name, address, code, phone, email, prefix] = params;
      const clash = taken({ code, email, prefix }, row);
      if (clash) return clash;
      Object.assign(row, { name, address, code, phone, email, prefix });
      return Promise.resolve({ rows: [row] });
    }
    if (sql.startsWith('UPDATE clients SET disabled_at')) {
      const row = rows.find((r) => r.id === params[0]);
      if (!row) return Promise.resolve({ rows: [] });
      row.disabled_at = sql.includes('disabled_at = NULL')
        ? null
        : new Date('2026-11-13T13:00:00Z');
      return Promise.resolve({ rows: [row] });
    }
    if (sql.includes('FROM clients WHERE id = $1')) {
      const row = rows.find((r) => r.id === params[0]);
      return Promise.resolve({ rows: row ? [row] : [] });
    }
    if (sql.includes('FROM clients ORDER BY')) {
      return Promise.resolve({ rows });
    }
    if (sql.includes('FROM users WHERE id = $1')) {
      return Promise.resolve({
        rows: params[0] === ADMIN_ID ? [adminRow] : [],
      });
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
    .sign({ sub: ADMIN_ID, email: 'admin@example.com' });
  return { app, token };
}

const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('clients (e2e)', () => {
  afterEach(() => {
    delete process.env.DATABASE_ENABLED;
    delete process.env.CLIENTS_ENABLED;
  });

  it('answers 404 to everything while CLIENTS_ENABLED is off, even without a token', async () => {
    const { app } = await createApp(false);

    await request(app.getHttpServer()).get('/clients').expect(404);
    await app.close();
  });

  it('answers 401 without a login token', async () => {
    const { app } = await createApp();
    const server = app.getHttpServer();

    await request(server).get('/clients').expect(401);
    await request(server).post('/clients').send(acme).expect(401);
    await app.close();
  });

  it('creates a client (201), lowercases the email, stores empty optional fields as null, and lists it', async () => {
    const { app, token } = await createApp();
    const server = app.getHttpServer();

    const created = await request(server)
      .post('/clients')
      .set(authed(token))
      .send({
        name: '  Acme  ',
        address: '',
        code: ' ACME ',
        email: acme.email,
        prefix: ' ACM ',
      })
      .expect(201);

    expect(created.body.data).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Acme',
      address: null,
      code: 'ACME',
      phone: null,
      email: 'info@acme.com',
      prefix: 'ACM',
      createdAt: '2026-11-13T12:00:00.000Z',
      updatedAt: '2026-11-13T12:00:00.000Z',
      isActive: true,
    });
    const list = await request(server).get('/clients').set(authed(token));
    expect(list.body.data).toHaveLength(1);
    await app.close();
  });

  it('answers 400 naming the field for a missing name, a missing or bad email, a missing or too long prefix, or a too long code', async () => {
    const { app, token } = await createApp();
    const server = app.getHttpServer();

    for (const [body, field] of [
      [{ ...acme, name: '   ' }, 'name'],
      [{ ...acme, email: 'not-an-email' }, 'email'],
      [{ ...acme, email: undefined }, 'email'],
      [{ ...acme, email: '' }, 'email'],
      [{ ...acme, prefix: undefined }, 'prefix'],
      [{ ...acme, prefix: 'x'.repeat(11) }, 'prefix'],
      [{ ...acme, code: 'x'.repeat(46) }, 'code'],
    ] as const) {
      const response = await request(server)
        .post('/clients')
        .set(authed(token))
        .send(body)
        .expect(400);
      expect(response.body.errors[0].field).toBe(field);
    }
    await app.close();
  });

  it('answers 409 naming the field for a code, an email or a prefix that another client has, whatever the letter case', async () => {
    const { app, token } = await createApp();
    const server = app.getHttpServer();
    const post = (body: object) =>
      request(server).post('/clients').set(authed(token)).send(body);
    const other = { name: 'Other', email: 'other@x.com', prefix: 'OTH' };

    await post(acme).expect(201);
    for (const [body, field] of [
      [{ ...other, code: 'acme' }, 'code'],
      [{ ...other, email: 'INFO@acme.com' }, 'email'],
      [{ ...other, prefix: 'acm' }, 'prefix'],
    ] as const) {
      const response = await post(body).expect(409);
      expect(response.body.errors[0]).toMatchObject({ field });
    }
    await app.close();
  });

  it('allows two clients without a code', async () => {
    const { app, token } = await createApp();
    const server = app.getHttpServer();
    const post = (body: object) =>
      request(server).post('/clients').set(authed(token)).send(body);

    await post({ name: 'A', email: 'a@x.com', prefix: 'A' }).expect(201);
    await post({ name: 'B', email: 'b@x.com', prefix: 'B' }).expect(201);
    await app.close();
  });

  it('gets and updates a client; 404 for an unknown id or something that is not an id', async () => {
    const { app, token } = await createApp();
    const server = app.getHttpServer();
    const { body } = await request(server)
      .post('/clients')
      .set(authed(token))
      .send(acme);
    const id = body.data.id as string;

    await request(server).get(`/clients/${id}`).set(authed(token)).expect(200);
    const updated = await request(server)
      .put(`/clients/${id}`)
      .set(authed(token))
      .send({ ...acme, name: 'Acme Corp' })
      .expect(200);
    expect(updated.body.data.name).toBe('Acme Corp');
    await request(server)
      .put('/clients/00000000-0000-4000-8000-0000000000ff')
      .set(authed(token))
      .send(acme)
      .expect(404);
    await request(server).get('/clients/nope').set(authed(token)).expect(404);
    await app.close();
  });

  it('disables and enables a client; it stays in the list either way', async () => {
    const { app, token } = await createApp();
    const server = app.getHttpServer();
    const { body } = await request(server)
      .post('/clients')
      .set(authed(token))
      .send(acme);
    const id = body.data.id as string;

    const off = await request(server)
      .post(`/clients/${id}/disable`)
      .set(authed(token))
      .expect(200);
    expect(off.body.data.isActive).toBe(false);
    const on = await request(server)
      .post(`/clients/${id}/enable`)
      .set(authed(token))
      .expect(200);
    expect(on.body.data.isActive).toBe(true);
    const list = await request(server).get('/clients').set(authed(token));
    expect(list.body.data).toHaveLength(1);
    await app.close();
  });
});
