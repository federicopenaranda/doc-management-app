import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { Env } from './config/env.validation.js';

/** App-level setup shared by main.ts and the e2e tests, so what we test is what runs. */
export function setupApp(app: NestExpressApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Behind Google's front end the socket IP is the proxy's; without this every client
  // would share one rate-limit bucket. shortcut: trusts exactly 1 hop, recheck if a load balancer is added in front.
  if (config.get('NODE_ENV') === 'production') {
    app.set('trust proxy', 1);
  }

  // Cloud Run sends SIGTERM and kills the container ~10s later. This makes Nest stop accepting
  // requests and run onModuleDestroy/onApplicationShutdown (close DB pools, queues) before exiting.
  app.enableShutdownHooks();

  app.use(helmet());
  app.enableCors({
    origin: config.get('FRONTEND_URLS'),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
    exposedHeaders: ['x-correlation-id'],
    maxAge: 600,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
