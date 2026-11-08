import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';
import { databaseSettings } from './database.config.js';
import { DatabaseService, createDatabaseService } from './database.service.js';

@Module({
  providers: [
    {
      provide: DatabaseService,
      inject: [ConfigService],
      // null while the feature flag is off: nothing connects.
      useFactory: (config: ConfigService<Env, true>) => {
        const settings = databaseSettings({
          DATABASE_ENABLED: config.get('DATABASE_ENABLED', { infer: true }),
          DATABASE_URL: config.get('DATABASE_URL', { infer: true }),
          CLOUD_SQL_INSTANCE: config.get('CLOUD_SQL_INSTANCE', { infer: true }),
          DB_NAME: config.get('DB_NAME', { infer: true }),
          DB_USER: config.get('DB_USER', { infer: true }),
        });
        return settings ? createDatabaseService(settings) : null;
      },
    },
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
