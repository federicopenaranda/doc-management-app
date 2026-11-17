import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

// ConfigModule.forRoot() validates the environment when AppModule is first imported,
// so each case re-imports the app after setting the flag.
async function createApp(
  enabled: boolean,
  query: (sql: string) => Promise<unknown>,
) {
  process.env.DATABASE_ENABLED = String(enabled);
  vi.resetModules();
  const { AppModule } = await import('./../src/app.module.js');
  const { setupApp } = await import('./../src/app.setup.js');
  const { DatabaseService } =
    await import('./../src/database/database.service.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue(enabled ? { pool: { query } } : null)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  setupApp(app);
  await app.init();
  return app;
}

describe('GET /health/database (e2e)', () => {
  afterEach(() => {
    delete process.env.DATABASE_ENABLED;
  });

  it('is 404 while the feature flag is off', async () => {
    const app = await createApp(false, () => Promise.resolve());

    await request(app.getHttpServer()).get('/health/database').expect(404);
    await app.close();
  });

  it('reads the prueba table and answers ok when the database works', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = await createApp(true, query);

    const response = await request(app.getHttpServer())
      .get('/health/database')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('prueba'));
    await app.close();
  });

  it('answers 503 when the database cannot be reached (for example it is stopped)', async () => {
    const app = await createApp(true, () =>
      Promise.reject(new Error('connect ETIMEDOUT')),
    );

    const response = await request(app.getHttpServer())
      .get('/health/database')
      .expect(503);

    // The uniform error filter reshapes Terminus's body; the status code is the signal.
    expect(response.body.code).toBe(503);
    await app.close();
  });

  it('keeps the main /health route working when the database is down', async () => {
    const app = await createApp(true, () =>
      Promise.reject(new Error('connect ETIMEDOUT')),
    );

    await request(app.getHttpServer()).get('/health').expect(200);
    await app.close();
  });
});
