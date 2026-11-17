import './config/bootstrap-env.js'; // must stay first: loads the mounted secret before AppModule validates env
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { setupApp } from './app.setup.js';
import type { Env } from './config/env.validation.js';
import { setupSwagger } from './swagger.setup.js';

async function bootstrap() {
  // bufferLogs holds early logs until the Pino logger replaces Nest's default one.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));
  setupApp(app);

  // Local development only: Swagger is not served anywhere else.
  const document = await setupSwagger(app);
  if (document) {
    // Also write the spec to /docs so the frontend can generate its API client from it.
    const file = join(import.meta.dirname, '..', '..', 'docs', 'swagger.json');
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(document, null, 2));
  }

  await app.listen(
    app.get<ConfigService<Env, true>>(ConfigService).get('PORT'),
  );
}
await bootstrap();
