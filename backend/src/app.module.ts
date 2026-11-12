import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor.js';
import { AuthModule } from './auth/auth.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { UploadsModule } from './uploads/uploads.module.js';
import { UsersModule } from './users/users.module.js';
import { HealthModule } from './health/health.module.js';
import { validateEnv, type Env } from './config/env.validation.js';
import { buildPinoHttpOptions } from './logging/logger.config.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: buildPinoHttpOptions(
          config.get('LOG_LEVEL'),
          config.get('NODE_ENV') === 'development',
        ),
      }),
    }),
    // Global limit: 100 requests per minute per IP. Override per route with @Throttle().
    HealthModule,
    AuthModule,
    DocumentsModule,
    UploadsModule,
    UsersModule,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
