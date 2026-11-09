import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

// ConfigModule.forRoot() validates the environment when AppModule is first imported,
// so each case re-imports the app after setting the flag.
async function createApp(uploadsEnabled: boolean, authEnabled = false) {
  process.env.UPLOADS_ENABLED = String(uploadsEnabled);
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
    .useValue(authEnabled ? { pool: { query: vi.fn() } } : null)
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
    delete process.env.UPLOADS_ENABLED;
    delete process.env.AUTH_ENABLED;
    delete process.env.DATABASE_ENABLED;
  });

  describe('while login is on (AUTH_ENABLED)', () => {
    it('answers 401 without a token', async () => {
      const app = await createApp(true, true);

      await request(app.getHttpServer())
        .post('/uploads/sign')
        .send(body)
        .expect(401);
      await app.close();
    });

    it('answers 401 for a token that is not valid', async () => {
      const app = await createApp(true, true);

      await request(app.getHttpServer())
        .post('/uploads/sign')
        .set('Authorization', 'Bearer not-a-real-token')
        .send(body)
        .expect(401);
      await app.close();
    });

    it('signs for a valid token', async () => {
      const app = await createApp(true, true);
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

    it('is still 404 when the uploads flag is off, even with a valid token', async () => {
      const app = await createApp(false, true);
      const token = app
        .get(JwtService)
        .sign({ sub: 'user-1', email: 'ana@example.com' });

      await request(app.getHttpServer())
        .post('/uploads/sign')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
        .expect(404);
      await app.close();
    });
  });

  it('is 404 while the feature flag is off', async () => {
    const app = await createApp(false);

    await request(app.getHttpServer())
      .post('/uploads/sign')
      .send(body)
      .expect(404);
    await app.close();
  });

  it('returns a signed upload per file when the flag is on', async () => {
    const app = await createApp(true);

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
    const app = await createApp(true);

    await request(app.getHttpServer())
      .post('/uploads/sign')
      .send({ files: [{ name: 'a/b.pdf', size: 1 }] })
      .expect(400);
    await app.close();
  });
});
