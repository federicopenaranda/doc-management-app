import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';
import { OBJECT_STORE } from './../src/documents/object-store.js';
import { TikaClient } from './../src/documents/tika.client.js';

const body = {
  message: {
    data: Buffer.from(
      JSON.stringify({ bucket: 'dms-test', name: 'a.pdf', generation: '1' }),
    ).toString('base64'),
  },
};

describe('POST /pubsub/documents (e2e)', () => {
  let app: NestExpressApplication;
  const store = {
    download: vi.fn().mockResolvedValue(Buffer.from('x')),
    upload: vi.fn().mockResolvedValue(undefined),
  };
  const tika = {
    extract: vi
      .fn()
      .mockResolvedValue({ title: 'T', content: 'C', metadata: {} }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OBJECT_STORE)
      .useValue(store)
      .overrideProvider(TikaClient)
      .useValue(tika)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 401 without a Pub/Sub token and does not process', async () => {
    await request(app.getHttpServer())
      .post('/pubsub/documents')
      .send(body)
      .expect(401);

    expect(store.upload).not.toHaveBeenCalled();
  });

  it('answers 401 for a token Google does not accept', async () => {
    await request(app.getHttpServer())
      .post('/pubsub/documents')
      .set('Authorization', 'Bearer not-a-real-token')
      .send(body)
      .expect(401);
  });
});
