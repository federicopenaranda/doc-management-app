import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

// AppModule validates the environment as soon as it is imported, so NODE_ENV must be set first.
// Each e2e file runs in its own worker, so this does not leak into the other files.
process.env.NODE_ENV = 'development';
const { AppModule } = await import('./../src/app.module.js');
const { setupApp } = await import('./../src/app.setup.js');
const { setupSwagger } = await import('./../src/swagger.setup.js');

describe('Swagger in local development (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestExpressApplication>();
    setupApp(app);
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves the UI and the OpenAPI document with bearer auth, and returns the document', async () => {
    const document = await setupSwagger(app);
    await app.init();

    expect(document?.info.title).toBe('DMS API');
    await request(app.getHttpServer()).get('/api').expect(200);
    const res = await request(app.getHttpServer()).get('/api-json').expect(200);
    expect(res.body.openapi).toBeDefined();
    expect(res.body.components.securitySchemes.bearer.scheme).toBe('bearer');
  });
});
