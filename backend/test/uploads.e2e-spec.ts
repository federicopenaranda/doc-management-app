import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

// ConfigModule.forRoot() validates the environment when AppModule is first imported,
// so each case re-imports the app after setting the flags.
async function createApp(authEnabled = false) {
  process.env.AUTH_ENABLED = String(authEnabled);
  process.env.DATABASE_ENABLED = String(authEnabled);
  vi.resetModules();
  const { AppModule } = await import('./../src/app.module.js');
  const { setupApp } = await import('./../src/app.setup.js');
  const { URL_SIGNER } = await import('./../src/uploads/url-signer.js');
  const { DatabaseService } =
    await import('./../src/database/database.service.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue(
      authEnabled
        ? {
            pool: {
              // Every request checks that the token's user is still active: here that is always so.
              query: vi.fn().mockResolvedValue({
                rows: [
                  {
                    id: 'user-1',
                    email: 'ana@example.com',
                    first_name: 'Ana',
                    last_name: 'García',
                    is_active: true,
                    created_at: new Date('2026-11-09T12:00:00Z'),
                  },
                ],
              }),
            },
          }
        : null,
    )
    .overrideProvider(URL_SIGNER)
    .useValue({
      sign: (_bucket: string, name: string) =>
        Promise.resolve(`https://signed.example/${name}`),
    })
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app);
  await app.init();
  return app;
}

const body = {
  files: [{ name: 'a.pdf', size: 10, contentType: 'application/pdf' }],
};

describe('POST /uploads/sign (e2e)', () => {
  afterEach(() => {
    delete process.env.AUTH_ENABLED;
    delete process.env.DATABASE_ENABLED;
  });

  describe('while login is on (AUTH_ENABLED)', () => {
    it('answers 401 without a token', async () => {
      const app = await createApp(true);

      await request(app.getHttpServer())
        .post('/uploads/sign')
        .send(body)
        .expect(401);
      await app.close();
    });

    it('answers 401 for a token that is not valid', async () => {
      const app = await createApp(true);

      await request(app.getHttpServer())
        .post('/uploads/sign')
        .set('Authorization', 'Bearer not-a-real-token')
        .send(body)
        .expect(401);
      await app.close();
    });

    it('signs for a valid token', async () => {
      const app = await createApp(true);
      const token = app
        .get(JwtService)
        .sign({ sub: 'user-1', email: 'ana@example.com' });

      await request(app.getHttpServer())
        .post('/uploads/sign')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(200);
      await app.close();
    });
  });

  it('returns a signed upload per file', async () => {
    const app = await createApp();

    const response = await request(app.getHttpServer())
      .post('/uploads/sign')
      .send(body)
      .expect(200);

    expect(response.body).toEqual({
      uploads: [
        {
          name: 'a.pdf',
          url: 'https://signed.example/a.pdf',
          headers: {
            'Content-Type': 'application/pdf',
            'x-goog-if-generation-match': '0',
          },
        },
      ],
    });
    await app.close();
  });

  it('answers 400 for an invalid request', async () => {
    const app = await createApp();

    await request(app.getHttpServer())
      .post('/uploads/sign')
      .send({ files: [{ name: 'a/b.pdf', size: 1 }] })
      .expect(400);
    await app.close();
  });
});
