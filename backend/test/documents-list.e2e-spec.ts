import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

const DOC_ID = '6f1e0f0e-5d3c-4b7a-9d52-0a1f3c2b7e11';

// ConfigModule.forRoot() validates the environment when AppModule is first imported,
// so each case re-imports the app after setting the flags.
async function createApp(clientId: string | null = 'client-1') {
  process.env.DATABASE_ENABLED = 'true';
  vi.resetModules();
  const { AppModule } = await import('./../src/app.module.js');
  const { setupApp } = await import('./../src/app.setup.js');
  const { URL_SIGNER } = await import('./../src/uploads/url-signer.js');
  const { DatabaseService } =
    await import('./../src/database/database.service.js');
  const query = vi.fn((sql: string, params: string[] = []) => {
    if (sql.includes('FROM documents WHERE client_id')) {
      return Promise.resolve({
        rows:
          params[0] === 'client-1'
            ? [
                {
                  id: DOC_ID,
                  original_name: 'Report.pdf',
                  size_bytes: '1234',
                  created_at: new Date('2026-11-20T12:00:00Z'),
                },
              ]
            : [],
      });
    }
    if (sql.includes('FROM documents WHERE id')) {
      const own = params[0] === DOC_ID && params[1] === 'client-1';
      return Promise.resolve({
        rows: own
          ? [{ storage_path: 'originals/acme/report-1/Report.pdf' }]
          : [],
      });
    }
    // The logged-in user: it also answers the "is this user still active?" check on every request.
    return Promise.resolve({
      rows: [
        {
          id: 'user-1',
          email: 'ana@example.com',
          first_name: 'Ana',
          last_name: 'García',
          is_active: true,
          created_at: new Date('2026-11-09T12:00:00Z'),
          client_id: clientId,
          roles: ['viewer'],
        },
      ],
    });
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue({ pool: { query } })
    .overrideProvider(URL_SIGNER)
    .useValue({
      sign: vi.fn(),
      signRead: (_bucket: string, name: string) =>
        Promise.resolve(`https://signed.example/read/${name}`),
    })
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app);
  await app.init();
  const token = app
    .get(JwtService)
    .sign({ sub: 'user-1', email: 'ana@example.com' });
  return { app, token };
}

describe('documents of the client (e2e)', () => {
  afterEach(() => {
    delete process.env.DATABASE_ENABLED;
  });

  it('answers 401 without a token', async () => {
    const { app } = await createApp();

    await request(app.getHttpServer()).get('/documents').expect(401);
    await request(app.getHttpServer())
      .get(`/documents/${DOC_ID}/view-url`)
      .expect(401);
    await app.close();
  });

  it('lists the documents of the client of the user, even for a viewer', async () => {
    const { app, token } = await createApp();

    const response = await request(app.getHttpServer())
      .get('/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toEqual([
      {
        id: DOC_ID,
        name: 'Report.pdf',
        sizeBytes: 1234,
        createdAt: '2026-11-20T12:00:00.000Z',
      },
    ]);
    await app.close();
  });

  it('lists nothing for a user with no client', async () => {
    const { app, token } = await createApp(null);

    const response = await request(app.getHttpServer())
      .get('/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toEqual([]);
    await app.close();
  });

  it('gives a read link for a document of the client', async () => {
    const { app, token } = await createApp();

    const response = await request(app.getHttpServer())
      .get(`/documents/${DOC_ID}/view-url`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.data).toEqual({
      url: 'https://signed.example/read/originals/acme/report-1/Report.pdf',
    });
    await app.close();
  });

  it('answers 404 for a document that is not the client’s, and for something that is not an id', async () => {
    const { app, token } = await createApp();

    await request(app.getHttpServer())
      .get('/documents/00000000-0000-4000-8000-0000000000ff/view-url')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get('/documents/nope/view-url')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    await app.close();
  });
});
