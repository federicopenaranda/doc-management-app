import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/app.setup.js';

const ALLOWED_ORIGIN = 'http://localhost:4200';

describe('AppController (e2e)', () => {
  let app: NestExpressApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();
  });

  it('has no endpoint at / any more (the Hello test endpoint is gone)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(404)
      .expect((res) => {
        expect(res.body).toMatchObject({
          success: false,
          code: 404,
          meta: { path: '/' },
        });
      });
  });

  it('echoes a client x-correlation-id on successful responses', () => {
    return request(app.getHttpServer())
      .get('/health')
      .set('x-correlation-id', 'client-id-1')
      .expect(200)
      .expect('x-correlation-id', 'client-id-1');
  });

  it('unknown route returns the standard error shape', () => {
    return request(app.getHttpServer())
      .get('/does-not-exist')
      .expect(404)
      .expect((res) => {
        expect(res.body).toEqual({
          success: false,
          code: 404,
          data: null,
          errors: [{ errorCode: 'ERR_NOT_FOUND', message: expect.any(String) }],
          meta: {
            correlationId: res.headers['x-correlation-id'],
            timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
            path: '/does-not-exist',
          },
        });
      });
  });

  describe('graceful shutdown', () => {
    it('listens for SIGTERM (Cloud Run) and SIGINT so providers can clean up', () => {
      // beforeEach already ran setupApp() on this app; a bare Nest app would add none.
      expect(process.listenerCount('SIGTERM')).toBeGreaterThan(0);
      expect(process.listenerCount('SIGINT')).toBeGreaterThan(0);
    });

    it('removes its signal listeners when the app closes', async () => {
      await app.close();

      expect(process.listenerCount('SIGTERM')).toBe(0);
      expect(process.listenerCount('SIGINT')).toBe(0);
      // afterEach closes the app again; closing twice must be harmless.
    });
  });

  describe('/health', () => {
    it('reports status ok', () => {
      return request(app.getHttpServer())
        .get('/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toMatchObject({ status: 'ok' });
        });
    });

    it('is not rate limited, so probes never get a 429', async () => {
      for (let i = 0; i < 105; i++) {
        await request(app.getHttpServer()).get('/health').expect(200);
      }
    });
  });

  describe('HTTP security', () => {
    it('sets helmet headers and hides x-powered-by', async () => {
      const res = await request(app.getHttpServer()).get('/');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['strict-transport-security']).toBeDefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('allows a configured frontend origin and exposes the correlation id', async () => {
      const res = await request(app.getHttpServer())
        .get('/')
        .set('Origin', ALLOWED_ORIGIN);

      expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
      expect(res.headers['access-control-expose-headers']).toContain(
        'x-correlation-id',
      );
    });

    it('does not grant CORS to any other origin', async () => {
      const res = await request(app.getHttpServer())
        .get('/')
        .set('Origin', 'https://evil.example');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('answers preflight with only the allowed methods and headers', async () => {
      const res = await request(app.getHttpServer())
        .options('/')
        .set('Origin', ALLOWED_ORIGIN)
        .set('Access-Control-Request-Method', 'POST');

      expect(res.status).toBe(204);
      expect(res.headers['access-control-allow-methods']).toBe(
        'GET,POST,PUT,PATCH,DELETE',
      );
      expect(res.headers['access-control-allow-headers']).toBe(
        'Content-Type,Authorization,x-correlation-id',
      );
    });
  });

  describe('rate limiting', () => {
    it('allows 100 requests per minute per IP, then answers 429', async () => {
      // /health is exempt from throttling on purpose; an answer of 401 still counts toward the limit.
      for (let i = 0; i < 100; i++) {
        await request(app.getHttpServer()).get('/auth/me').expect(401);
      }

      await request(app.getHttpServer())
        .get('/auth/me')
        .expect(429)
        .expect((res) => {
          expect(res.body.errors[0].errorCode).toBe('ERR_RATE_LIMITED');
        });
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
