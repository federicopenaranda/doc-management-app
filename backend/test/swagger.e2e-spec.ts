import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { setupSwagger } from './../src/swagger.setup.js';

// NODE_ENV is "test" here (see vitest.config.e2e.ts): anything but local development.
describe('Swagger outside local development (e2e)', () => {
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

  it('returns no document and registers nothing', async () => {
    expect(await setupSwagger(app)).toBeUndefined();
    await app.init();

    await request(app.getHttpServer()).get('/api').expect(404);
    await request(app.getHttpServer()).get('/api-json').expect(404);
  });
});
